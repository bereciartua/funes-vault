import { ChatMessageRole } from "@funes-vault/db";
import type { ChatCitation } from "@funes-vault/shared";
import {
  type ChatMessageRequest,
  type ChatProviderDisclosure,
  type ChatStreamMessageRequest
} from "@funes-vault/shared";
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createUIMessageStream } from "ai";

import { lockUser } from "../common/db-locks.js";
import { toJson } from "../common/serialization.js";
import { apiEnv } from "../config.js";
import { ExtractionRunService } from "../memory-processing/extraction-run.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { chatHistoryLimit } from "./chat.constants.js";
import { toChatEntry } from "./chat.mapper.js";
import { safeErrorMessage } from "./chat.utils.js";
import {
  ChatGenerationService,
  type FunesUIMessage
} from "./chat-generation.service.js";
import { ThreadTitleService } from "./thread-title.service.js";

/**
 * Owns chat turn orchestration and message persistence.
 * Tenant boundary: thread and message access requires the current userId.
 * Audit: memory mutations and disclosures flow through audited domain services.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: ChatGenerationService,
    private readonly titles: ThreadTitleService,
    private readonly extractionRunService: ExtractionRunService
  ) {}

  async persistAssistantTurn(input: {
    userId: string;
    sessionId: string;
    content: string;
    citations: ChatCitation[];
    suggestedMemoryIds: string[];
    provider: ChatProviderDisclosure;
    processing?: unknown;
  }) {
    const message = await this.prisma.client.chatMessage.create({
      data: {
        ...input,
        role: ChatMessageRole.ASSISTANT,
        processing: input.processing ? toJson(input.processing) : undefined
      }
    });
    await this.prisma.client.chatSession.update({
      where: { id: input.sessionId },
      data: { updatedAt: new Date() }
    });

    return message;
  }

  async sendMessage(input: { userId: string; body: ChatMessageRequest }) {
    const request = input.body;

    if (!apiEnv().OPENAI_API_KEY) {
      throw new ServiceUnavailableException(
        "Memory chat requires a configured OpenAI model provider."
      );
    }

    const { session, source } = await this.acceptTurn(input.userId, request);
    const conversation = await this.loadRecentConversation({
      userId: input.userId,
      sessionId: session.id
    });
    const processing = await this.extractionRunService.process(
      input.userId,
      source.id
    );
    const generated = await this.generation.generateAnswer(
      input.userId,
      conversation,
      source.id,
      processing,
      request.timezone
    );
    const finalProcessing = await this.extractionRunService.result(
      input.userId,
      source.id
    );
    const provider = generated.provider ?? this.generation.disclosure();
    const assistantMessage = await this.persistAssistantTurn({
      userId: input.userId,
      sessionId: session.id,
      content: generated.answer,
      citations: generated.citations,
      suggestedMemoryIds: generated.suggestedMemoryIds,
      provider,
      processing: finalProcessing
    });
    const title = await this.titles.maybeUpdateAutomaticThreadTitle({
      userId: input.userId,
      sessionId: session.id,
      messages: [
        ...conversation,
        {
          role: "assistant" as const,
          content: generated.answer
        }
      ]
    });

    return {
      sessionId: session.id,
      title: title ?? session.title,
      titleLocked: session.titleLocked,
      message: toChatEntry(assistantMessage),
      answer: generated.answer,
      citations: generated.citations,
      suggestedMemoryIds: generated.suggestedMemoryIds,
      provider
    };
  }

  async streamMessage(input: {
    userId: string;
    body: ChatStreamMessageRequest;
    abortSignal?: AbortSignal;
  }) {
    const request = input.body;

    if (!apiEnv().OPENAI_API_KEY) {
      throw new ServiceUnavailableException(
        "Memory chat requires a configured OpenAI model provider."
      );
    }

    const { session, source } = await this.acceptTurn(input.userId, request);
    const conversation = await this.loadRecentConversation({
      userId: input.userId,
      sessionId: session.id
    });
    const provider = this.generation.disclosure();

    return createUIMessageStream<FunesUIMessage>({
      execute: async ({ writer }) => {
        writer.write({
          type: "data-tool-trace",
          data: {
            toolCallId: source.id,
            toolName: "memory_capture",
            label: "Memory processing",
            status: "running",
            summary: "Checking this turn for useful memories.",
            metadata: { sourceMessageId: source.id }
          }
        });
        const processing = await this.extractionRunService.process(
          input.userId,
          source.id,
          "chat",
          input.abortSignal
        );
        await this.generation.writeStreamedAnswer({
          persistAssistantTurn: (turn) => this.persistAssistantTurn(turn),
          sourceMessageId: source.id,
          timezone: request.timezone,
          processing,
          userId: input.userId,
          sessionId: session.id,
          title: session.title,
          titleLocked: session.titleLocked,
          conversation,
          provider,
          writer,
          abortSignal: input.abortSignal
        });
      },
      onError: (error) => {
        this.logger.warn(
          `OpenAI chat streaming failed: ${safeErrorMessage(error)}`
        );

        return "Memory chat model provider is unavailable.";
      }
    });
  }

  // Voice turns reuse the chat thread records so a voice conversation can be
  // continued as text in the same thread. Voice-side validation (session
  // ownership, live state) happens in VoiceSessionsService before this runs.
  async persistVoiceTurn(input: {
    userId: string;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    citations: ChatCitation[];
    suggestedMemoryIds: string[];
    provider: ChatProviderDisclosure;
    voiceSessionId?: string;
    timezone?: string;
    itemId?: string;
  }) {
    const message = await this.prisma.client.$transaction(async (tx) => {
      if (input.voiceSessionId && input.itemId) {
        await tx.$queryRaw`SELECT id FROM "VoiceSession" WHERE id = ${input.voiceSessionId} AND "userId" = ${input.userId} FOR UPDATE`;
        const existing = await tx.chatMessage.findUnique({
          where: {
            voiceSessionId_voiceItemId_role: {
              voiceSessionId: input.voiceSessionId,
              voiceItemId: input.itemId,
              role:
                input.role === "user"
                  ? ChatMessageRole.USER
                  : ChatMessageRole.ASSISTANT
            }
          }
        });
        if (existing) {
          if (
            existing.userId !== input.userId ||
            existing.content !== input.content
          ) {
            throw new ConflictException("Finalized transcript cannot change");
          }

          return existing;
        }
      }

      return tx.chatMessage.create({
        data: {
          sourceTimezone: input.timezone,
          voiceSessionId: input.voiceSessionId,
          voiceItemId: input.itemId,
          sessionId: input.sessionId,
          userId: input.userId,
          role:
            input.role === "user"
              ? ChatMessageRole.USER
              : ChatMessageRole.ASSISTANT,
          content: input.content,
          citations: input.citations,
          suggestedMemoryIds: input.suggestedMemoryIds,
          provider: input.provider
        }
      });
    });
    const processing =
      input.role === "user"
        ? await this.extractionRunService.process(
            input.userId,
            message.id,
            "voice"
          )
        : message.processing;
    await this.prisma.client.chatSession.update({
      where: { id: input.sessionId },
      data: { updatedAt: new Date() }
    });

    let title: string | null = null;

    if (input.role === "assistant") {
      const history = await this.loadRecentConversation({
        userId: input.userId,
        sessionId: input.sessionId
      });
      title = await this.titles.maybeUpdateAutomaticThreadTitle({
        userId: input.userId,
        sessionId: input.sessionId,
        messages: history
      });
    }

    return {
      message: toChatEntry({ ...message, processing }),
      title
    };
  }

  private async acceptTurn(
    userId: string,
    request: ChatMessageRequest | ChatStreamMessageRequest
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      // Serialize acceptance per owner, including first-message thread creation.
      await lockUser(tx, userId);
      if (request.submissionId) {
        const source = await tx.chatMessage.findUnique({
          where: {
            userId_submissionId: { userId, submissionId: request.submissionId }
          }
        });
        if (source) {
          if (
            source.content !== request.message ||
            (request.sessionId && source.sessionId !== request.sessionId)
          ) {
            throw new ConflictException(
              "Submission ID already used for another turn"
            );
          }
          const session = await tx.chatSession.findUniqueOrThrow({
            where: { id: source.sessionId }
          });

          return { session, source };
        }
      }
      let session = request.sessionId
        ? await tx.chatSession.findFirst({
            where: { id: request.sessionId, userId }
          })
        : request.startNewThread
          ? null
          : await tx.chatSession.findFirst({
              where: { userId },
              orderBy: { updatedAt: "desc" }
            });
      if (request.sessionId && !session) {
        throw new NotFoundException("Thread not found");
      }
      session ??= await tx.chatSession.create({
        data: { userId, title: null }
      });
      const source = await tx.chatMessage.create({
        data: {
          userId,
          sessionId: session.id,
          role: ChatMessageRole.USER,
          content: request.message,
          sourceTimezone: request.timezone,
          submissionId: request.submissionId
        }
      });

      return { session, source };
    });
  }

  private async loadRecentConversation(input: {
    userId: string;
    sessionId: string;
  }): Promise<ChatMessageRequest["history"]> {
    const messages = await this.prisma.client.chatMessage.findMany({
      where: { userId: input.userId, sessionId: input.sessionId },
      orderBy: { createdAt: "desc" },
      take: chatHistoryLimit
    });

    return messages.reverse().map((message) => ({
      role:
        message.role === ChatMessageRole.USER
          ? ("user" as const)
          : ("assistant" as const),
      content: message.content
    }));
  }
}
