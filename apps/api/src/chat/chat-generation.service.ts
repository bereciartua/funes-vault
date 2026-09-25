import { openai } from "@ai-sdk/openai";
import {
  type ChatCitation,
  type ChatMessageRequest,
  type ChatProviderDisclosure,
  type FunesDataParts,
  type FunesMessageMetadata,
  memoryProcessingResultSchema
} from "@funes-vault/shared";
import {
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  generateText,
  Output,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
  type UIMessageStreamWriter
} from "ai";
import { z } from "zod";

import { apiEnv } from "../config.js";
import { categoryPromptSelect } from "../memories/memory.types.js";
import { ExtractionReconciliationService } from "../memory-processing/extraction-reconciliation.service.js";
import { ExtractionRunService } from "../memory-processing/extraction-run.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { chatModelHistoryLimit, chatToolStepLimit } from "./chat.constants.js";
import type { ChatService } from "./chat.service.js";
import { citationsForRefs, safeErrorMessage } from "./chat.utils.js";
import { ChatMemoryToolsService } from "./chat-memory-tools.service.js";
import { interviewGuidanceText } from "./guided-interview.js";
import { writeProcessingEvents } from "./processing-events.js";
import { StewardEventWriter } from "./steward-event-writer.js";
import {
  buildMemoryStewardSystemPrompt,
  currentDateForPrompt
} from "./steward-prompt.js";
import {
  type MemoryCategoryForTool,
  type StewardToolContext,
  type StewardToolRunState
} from "./steward-tool.types.js";
import { createStewardToolRunState } from "./steward-tool-state.js";
import { memoryStewardToolDefinitions } from "./steward-tools.js";
import { ThreadTitleService } from "./thread-title.service.js";

export type GeneratedChatAnswer = {
  answer: string;
  citations: ChatCitation[];
  provider?: ChatProviderDisclosure;
  suggestedMemoryIds: string[];
};

export type FunesUIMessage = UIMessage<FunesMessageMetadata, FunesDataParts>;

type GenerationState = {
  runState: StewardToolRunState;
  events: StewardEventWriter;
};

const chatOutputSchema = z.object({
  answer: z.string().min(1),
  citedRefs: z
    .array(z.number().int().min(1))
    .describe(
      "The numeric citation references actually used in the answer, such as [1]. Leave empty when no memory references were used."
    )
});

/**
 * Runs blocking or streaming model generation for the supplied owner and conversation. Tool
 * calls delegate to authorized domain services; typed stream events describe their results. It
 * does not itself write audit records or establish thread ownership.
 */
@Injectable()
export class ChatGenerationService {
  private readonly logger = new Logger(ChatGenerationService.name);
  private readonly provider = "openai";
  private readonly model = apiEnv().OPENAI_CHAT_MODEL;

  constructor(
    private readonly chatMemoryTools: ChatMemoryToolsService,
    private readonly prisma: PrismaService,
    private readonly extractionRunService: ExtractionRunService,
    private readonly extractionReconciliationService: ExtractionReconciliationService,
    private readonly titles: ThreadTitleService
  ) {}

  disclosure() {
    return {
      provider: this.provider,
      model: this.model,
      usesThirdParty: true,
      disclosure:
        "Chat sends messages and retrieved memory snippets to OpenAI. Memory extraction also processes the latest message and limited preceding context with the selected memory provider. Review provider choices in settings."
    };
  }

  async generateAnswer(
    userId: string,
    conversation: ChatMessageRequest["history"],
    sourceMessageId?: string,
    processing?: unknown,
    timezone = "UTC"
  ): Promise<GeneratedChatAnswer> {
    const state = this.createGenerationState();
    const generation = await this.createGenerationSetup(
      userId,
      state,
      sourceMessageId,
      processing,
      timezone
    );

    try {
      const result = await generateText({
        model: openai(this.model),
        messages: conversation.slice(-chatModelHistoryLimit).map((entry) => ({
          role: entry.role,
          content: entry.content
        })),
        system: generation.system,
        tools: generation.tools,
        stopWhen: stepCountIs(chatToolStepLimit),
        abortSignal: AbortSignal.timeout(apiEnv().OPENAI_TIMEOUT_MS),
        output: Output.object({
          schema: chatOutputSchema,
          name: "memoryChatAnswer",
          description:
            "A conversational answer plus the exact citation reference numbers used."
        })
      });
      const answer = result.output.answer.trim();

      if (!answer) {
        throw new Error("Provider returned an empty chat answer.");
      }

      return {
        answer,
        citations: citationsForRefs(
          result.output.citedRefs,
          state.runState.toolCitations
        ),
        provider: this.disclosure(),
        suggestedMemoryIds: state.runState.suggestedMemoryIds
      };
    } catch (error) {
      this.logger.warn(
        `OpenAI chat generation failed: ${safeErrorMessage(error)}`
      );
      throw new ServiceUnavailableException(
        "Memory chat model provider is unavailable."
      );
    }
  }

  async writeStreamedAnswer(input: {
    userId: string;
    sessionId: string;
    title: string | null;
    titleLocked: boolean;
    conversation: ChatMessageRequest["history"];
    sourceMessageId?: string;
    timezone?: string;
    processing?: unknown;
    provider: ChatProviderDisclosure;
    writer: UIMessageStreamWriter<FunesUIMessage>;
    abortSignal?: AbortSignal;
    persistAssistantTurn: ChatService["persistAssistantTurn"];
  }) {
    const state = this.createGenerationState(input.writer);
    const responseMessageId = `assistant_${Date.now().toString(36)}`;
    const textPartId = `${responseMessageId}_text`;
    const startedAt = new Date().toISOString();
    const startMetadata: FunesMessageMetadata = {
      sessionId: input.sessionId,
      createdAt: startedAt,
      provider: input.provider,
      processing:
        input.processing === undefined
          ? undefined
          : memoryProcessingResultSchema.parse(input.processing)
    };

    input.writer.write({
      type: "start",
      messageId: responseMessageId,
      messageMetadata: startMetadata
    });
    input.writer.write({
      type: "data-thread-state",
      id: input.sessionId,
      data: {
        sessionId: input.sessionId,
        title: input.title,
        titleLocked: input.titleLocked,
        persisted: true
      }
    });
    state.events.writeProviderDisclosure(input.provider);
    const generation = await this.createGenerationSetup(
      input.userId,
      state,
      input.sourceMessageId,
      input.processing,
      input.timezone
    );

    input.writer.write({
      type: "text-start",
      id: textPartId
    });

    const result = streamText({
      model: openai(this.model),
      messages: input.conversation
        .slice(-chatModelHistoryLimit)
        .map((entry) => ({
          role: entry.role,
          content: entry.content
        })),
      system: generation.system,
      tools: generation.tools,
      stopWhen: stepCountIs(chatToolStepLimit),
      abortSignal: input.abortSignal
    });

    let answer = "";
    for await (const delta of result.textStream) {
      answer += delta;
      input.writer.write({
        type: "text-delta",
        id: textPartId,
        delta
      });
    }

    input.writer.write({
      type: "text-end",
      id: textPartId
    });

    const persistedAnswer = answer.trim();

    if (!persistedAnswer) {
      throw new Error("Provider returned an empty streamed chat answer.");
    }

    const finalProcessing = input.sourceMessageId
      ? await this.extractionRunService.result(
          input.userId,
          input.sourceMessageId
        )
      : input.processing;
    const finishReason = await result.finishReason;
    const assistantMessage = await input.persistAssistantTurn({
      userId: input.userId,
      sessionId: input.sessionId,
      content: persistedAnswer,
      citations: state.runState.toolCitations,
      suggestedMemoryIds: state.runState.suggestedMemoryIds,
      provider: input.provider,
      processing: finalProcessing
    });
    const title = await this.titles.maybeUpdateAutomaticThreadTitle({
      userId: input.userId,
      sessionId: input.sessionId,
      messages: [
        ...input.conversation,
        {
          role: "assistant" as const,
          content: persistedAnswer
        }
      ]
    });

    if (title) {
      input.writer.write({
        type: "data-thread-state",
        id: input.sessionId,
        data: {
          sessionId: input.sessionId,
          title,
          titleLocked: false,
          persisted: true
        }
      });
    }

    const finishMetadata: FunesMessageMetadata = {
      ...startMetadata,
      processing:
        finalProcessing === undefined
          ? undefined
          : memoryProcessingResultSchema.parse(finalProcessing),
      persistedMessageId: assistantMessage.id,
      createdAt: assistantMessage.createdAt.toISOString(),
      finishReason
    };

    input.writer.write({
      type: "message-metadata",
      messageMetadata: finishMetadata
    });
    input.writer.write({
      type: "finish",
      finishReason,
      messageMetadata: finishMetadata
    });
  }

  private createGenerationState(
    writer?: UIMessageStreamWriter<FunesUIMessage>
  ): GenerationState {
    return {
      runState: createStewardToolRunState(),
      events: new StewardEventWriter(writer)
    };
  }

  private async createGenerationSetup(
    userId: string,
    state: GenerationState,
    sourceMessageId?: string,
    processing?: unknown,
    timezone = "UTC"
  ) {
    writeProcessingEvents(processing, state, sourceMessageId);
    const categories = await this.listMemoryCategories();
    const interviewGuidance = interviewGuidanceText();
    const context: StewardToolContext = {
      userId,
      sourceMessageId,
      runs: this.extractionRunService,
      reconciliation: this.extractionReconciliationService,
      channel: "chat",
      categories,
      chatMemoryTools: this.chatMemoryTools,
      state: state.runState,
      emit: (event) => state.events.writeStewardEvent(event)
    };
    const tools = Object.fromEntries(
      memoryStewardToolDefinitions.map((definition) => [
        definition.name,
        tool({
          description: definition.description,
          inputSchema: definition.inputSchema,
          execute: async (input, options) => {
            const output = await definition.execute(
              context,
              input,
              options.toolCallId
            );
            if (sourceMessageId) {
              await this.extractionReconciliationService.recordTool(
                userId,
                sourceMessageId,
                definition.name,
                input,
                output
              );
            }

            return output;
          }
        })
      ])
    );

    return {
      system:
        buildMemoryStewardSystemPrompt({
          categories,
          interviewGuidance,
          currentDate: currentDateForPrompt(timezone),
          channel: "chat"
        }) +
        `\nAuthoritative extraction results for this turn: ${JSON.stringify(processing ?? { status: "unavailable" })}. Never claim saved or queued unless this result confirms it.`,
      tools
    };
  }

  private async listMemoryCategories(): Promise<MemoryCategoryForTool[]> {
    return this.prisma.client.memoryCategory.findMany({
      select: categoryPromptSelect,
      orderBy: { name: "asc" }
    });
  }
}
