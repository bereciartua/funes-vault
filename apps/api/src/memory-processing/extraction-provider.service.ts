import type { ChatMessage, MemoryExtractionRun } from "@funes-vault/db";
import { ChatMessageRole } from "@funes-vault/db";
import { Injectable, NotFoundException } from "@nestjs/common";

import { apiEnv } from "../config.js";
import { categoryPromptSelect } from "../memories/memory.types.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  type ExtractionInput,
  extractionSchema,
  type ProcessingContext
} from "./contracts.js";
import {
  extractionContextCharacterLimit,
  extractionHistoryLimit,
  voiceFinalizationWindowMs
} from "./extraction.constants.js";
import { JevMemoryExtractionProvider } from "./jev-memory-extraction.provider.js";
import { LlmMemoryExtractionProvider } from "./llm-memory-extraction.provider.js";
import { type ProcessingConfiguration } from "./memory-processing-config.service.js";
import {
  ProcessingBlocked,
  ProcessingPermissionService
} from "./processing-permission.service.js";
import { validateCandidate } from "./validation.js";

/**
 * Loads an owner's source message, verifies the provider choice and prepares bounded provider
 * input. Invokes the configured provider outside transactions and validates its output; run and
 * outcome services own persistence.
 */
@Injectable()
export class ExtractionProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permission: ProcessingPermissionService,
    private readonly llm: LlmMemoryExtractionProvider,
    private readonly jev: JevMemoryExtractionProvider
  ) {}

  async loadSource(userId: string, sourceMessageId: string) {
    const source = await this.prisma.client.chatMessage.findFirst({
      where: { id: sourceMessageId, userId, role: ChatMessageRole.USER }
    });
    if (!source) {
      throw new NotFoundException("Source turn not found");
    }

    return source;
  }

  async prepareInput(
    userId: string,
    source: ChatMessage,
    run: MemoryExtractionRun,
    configuration: ProcessingConfiguration,
    channel: "chat" | "voice"
  ) {
    if (source.voiceSessionId) {
      channel = "voice";
      const voice = await this.prisma.client.voiceSession.findFirst({
        where: { id: source.voiceSessionId, userId }
      });
      // Eligibility belongs to the persisted transcript, not the time of a retry.
      // Current processor permission is still checked before each provider call.
      if (
        !voice ||
        (voice.endedAt &&
          source.createdAt.getTime() - voice.endedAt.getTime() >
            voiceFinalizationWindowMs)
      ) {
        throw new ProcessingBlocked("voice_transcript_arrived_too_late");
      }
      if (
        voice.extractionFingerprint &&
        voice.extractionFingerprint !==
          (configuration.extractionFingerprint || run.fingerprint)
      ) {
        throw new ProcessingBlocked("reconnect_voice_session");
      }
    }
    if (!configuration.extraction.available) {
      throw new ProcessingBlocked("provider_not_configured");
    }
    if (
      !apiEnv().OPENAI_API_KEY ||
      (configuration.extraction.system === "system_1" &&
        !apiEnv().TYPESAFE_API_KEY)
    ) {
      throw new ProcessingBlocked("configuration_unavailable");
    }
    const [history, categories] = await Promise.all([
      this.prisma.client.chatMessage.findMany({
        where: {
          userId,
          sessionId: source.sessionId,
          OR: [
            { createdAt: { lt: source.createdAt } },
            { createdAt: source.createdAt, id: { lt: source.id } }
          ]
        },
        orderBy: { createdAt: "desc" },
        take: extractionHistoryLimit
      }),
      this.prisma.client.memoryCategory.findMany({
        select: categoryPromptSelect
      })
    ]);
    const input: ExtractionInput = {
      source: { id: source.id, content: source.content },
      channel,
      context: history.reverse().map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content.slice(0, extractionContextCharacterLimit)
      })),
      categories,
      now: source.createdAt.toISOString(),
      timezone: source.sourceTimezone ?? "UTC"
    };

    return input;
  }

  async invokeProvider(
    userId: string,
    runId: string,
    input: ExtractionInput,
    configuration: ProcessingConfiguration,
    signal: AbortSignal,
    deadline: number
  ) {
    const context: ProcessingContext = {
      signal,
      deadline,
      correlationId: runId,
      configuration,
      beforeCall: (payload) =>
        this.permission.check(
          userId,
          "extraction",
          configuration.extraction.processors,
          payload
        )
    };
    await context.beforeCall(input);
    const output = await (
      configuration.extraction.system === "system_1" ? this.jev : this.llm
    ).extract(input, context);
    const parsed = extractionSchema.parse(output);
    const ids = new Set<string>();
    const candidates = parsed.candidates.map((c) => {
      const valid = validateCandidate(c, input);
      if (ids.has(c.id)) {
        return {
          ...valid,
          disposition: "rejected" as const,
          reason: "duplicate_candidate_id"
        };
      }
      ids.add(c.id);

      return valid;
    });

    return {
      candidates,
      partial: parsed.partial,
      diagnostics: output.diagnostics
    };
  }
}
