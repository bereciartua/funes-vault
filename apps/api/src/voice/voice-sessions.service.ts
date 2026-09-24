import { ChatMessageRole } from "@funes-vault/db";
import {
  type CreateVoiceSessionRequest,
  type EndVoiceSessionRequest,
  type VoiceSessionEndReason,
  type VoiceToolCallRequest,
  type VoiceTurnRequest
} from "@funes-vault/shared";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";

import { ChatService } from "../chat/chat.service.js";
import { safeErrorMessage as safeToolErrorMessage } from "../chat/chat.utils.js";
import { ChatMemoryToolsService } from "../chat/chat-memory-tools.service.js";
import { interviewGuidanceText } from "../chat/guided-interview.js";
import {
  buildMemoryStewardSystemPrompt,
  currentDateForPrompt
} from "../chat/steward-prompt.js";
import { type StewardToolEvent } from "../chat/steward-tool.types.js";
import { createStewardToolRunState } from "../chat/steward-tool-state.js";
import { findStewardTool } from "../chat/steward-tools.js";
import { apiEnv } from "../config.js";
import { FirstPartyAccessService } from "../first-party-access/first-party-access.service.js";
import { categoryPromptSelect } from "../memories/memory.types.js";
import { ExtractionReconciliationService } from "../memory-processing/extraction-reconciliation.service.js";
import { ExtractionRunService } from "../memory-processing/extraction-run.service.js";
import { MemoryProcessingConfigService } from "../memory-processing/memory-processing-config.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RealtimeClientService } from "./realtime-client.service.js";
import {
  utcDayStart,
  voiceProviderDisclosure,
  voiceRealtimeModel,
  voiceRealtimeVoice,
  voiceSessionLimits
} from "./voice.config.js";

/**
 * Owns voice session ownership and transcript lifecycle.
 * Tenant boundary: voice sessions and their chat threads belong to the authenticated user.
 * Audit: memory tools use audited domain services; provider API keys remain server-side.
 */
@Injectable()
export class VoiceSessionsService {
  private readonly logger = new Logger(VoiceSessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly chatMemoryTools: ChatMemoryToolsService,
    private readonly firstPartyAccess: FirstPartyAccessService,
    private readonly extractionRunService: ExtractionRunService,
    private readonly extractionReconciliationService: ExtractionReconciliationService,
    private readonly processingConfig: MemoryProcessingConfigService,
    private readonly realtime: RealtimeClientService
  ) {}

  async createVoiceSession(input: {
    userId: string;
    body: CreateVoiceSessionRequest;
  }) {
    const request = input.body;

    if (!apiEnv().OPENAI_API_KEY) {
      throw new ServiceUnavailableException(
        "Voice sessions require a configured OpenAI API key."
      );
    }

    const limits = voiceSessionLimits();
    const now = new Date();
    const dailySessionsUsed = await this.prisma.client.voiceSession.count({
      where: {
        userId: input.userId,
        startedAt: { gte: utcDayStart(now) }
      }
    });

    if (dailySessionsUsed >= limits.dailySessionCap) {
      throw new HttpException(
        "Daily voice session cap reached. Try again tomorrow or raise VOICE_DAILY_SESSION_CAP.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const chatSession = await this.resolveChatSession({
      userId: input.userId,
      sessionId: request.sessionId,
      startNewThread: request.startNewThread
    });

    // Provision defaults only for a new voice client; starting another session
    // preserves any permissions the owner edited or removed.
    await this.firstPartyAccess.ensureVoiceAccess(input.userId);

    const categories = await this.prisma.client.memoryCategory.findMany({
      select: categoryPromptSelect,
      orderBy: { name: "asc" }
    });
    const instructions = buildMemoryStewardSystemPrompt({
      categories,
      interviewGuidance: interviewGuidanceText(),
      currentDate: currentDateForPrompt(request.timezone),
      channel: "voice"
    });
    const model = voiceRealtimeModel();
    const voice = voiceRealtimeVoice();
    const clientSecret = await this.realtime.mintClientSecret({
      model,
      voice,
      instructions
    });

    const voiceSession = await this.prisma.client.voiceSession.create({
      data: {
        userId: input.userId,
        extractionFingerprint: this.processingConfig.effective.fingerprint,
        chatSessionId: chatSession.id,
        model
      }
    });

    return {
      voiceSessionId: voiceSession.id,
      sessionId: chatSession.id,
      title: chatSession.title,
      model,
      voice,
      clientSecret,
      limits: {
        ...limits,
        dailySessionsUsed: dailySessionsUsed + 1
      },
      provider: voiceProviderDisclosure()
    };
  }

  // Browser-executed tool bridge: the Realtime data channel surfaces a
  // function call, the browser forwards it here with its session cookie, and
  // the same steward tool implementation as memory chat runs against the
  // voice first-party client. The response carries the tool output for the
  // model plus the UI events (traces, citations, suggestions) for the
  // transcript view.
  async executeToolCall(input: {
    userId: string;
    voiceSessionId: string;
    body: VoiceToolCallRequest;
  }) {
    const request = input.body;
    await this.requireLiveVoiceSession(input.userId, input.voiceSessionId);

    const definition = findStewardTool(request.toolName);

    if (!definition) {
      throw new BadRequestException("Unknown voice tool");
    }

    const categories = await this.prisma.client.memoryCategory.findMany({
      select: categoryPromptSelect,
      orderBy: { name: "asc" }
    });
    const events: StewardToolEvent[] = [];
    const source =
      typeof request.sourceItemId === "string"
        ? await this.prisma.client.chatMessage.findFirst({
            where: {
              userId: input.userId,
              voiceSessionId: input.voiceSessionId,
              voiceItemId: request.sourceItemId,
              role: ChatMessageRole.USER
            }
          })
        : null;
    const context = {
      sourceMessageId: source?.id,
      runs: this.extractionRunService,
      reconciliation: this.extractionReconciliationService,
      userId: input.userId,
      channel: "voice" as const,
      categories,
      chatMemoryTools: this.chatMemoryTools,
      state: createStewardToolRunState(),
      emit: (event: StewardToolEvent) => {
        events.push(event);
      }
    };

    try {
      const output = await definition.execute(
        context,
        request.arguments,
        request.toolCallId
      );

      if (source) {
        await this.extractionReconciliationService.recordTool(
          input.userId,
          source.id,
          request.toolName,
          request.arguments,
          output
        );
      }

      return { output, events };
    } catch (error) {
      // Realtime models recover better from an error payload than from an
      // HTTP failure, so tool errors flow back as tool output.
      this.logger.warn(
        `Voice tool ${request.toolName} failed: ${safeToolErrorMessage(error)}`
      );

      return {
        output: {
          error: safeToolErrorMessage(error),
          retryable: true
        },
        events
      };
    }
  }

  async persistTurn(input: {
    userId: string;
    voiceSessionId: string;
    body: VoiceTurnRequest;
  }) {
    const request = input.body;
    // Transcripts may finalize moments after the session ends, so persistence
    // only requires ownership, not liveness. Extraction checks the persisted
    // finalization window and processor fingerprint and records skipped run outcomes.
    const voiceSession = await this.findVoiceSession(
      input.userId,
      input.voiceSessionId
    );

    return this.chatService.persistVoiceTurn({
      userId: input.userId,
      sessionId: voiceSession.chatSessionId,
      voiceSessionId: voiceSession.id,
      itemId: request.itemId,
      timezone: request.timezone,
      role: request.role,
      content: request.content,
      citations: request.citations,
      suggestedMemoryIds:
        request.role === "assistant" ? request.suggestedMemoryIds : [],
      provider: voiceProviderDisclosure()
    });
  }

  async endVoiceSession(input: {
    userId: string;
    voiceSessionId: string;
    body: EndVoiceSessionRequest;
  }) {
    const request = input.body;
    const voiceSession = await this.findVoiceSession(
      input.userId,
      input.voiceSessionId
    );

    if (voiceSession.endedAt) {
      return {
        voiceSessionId: voiceSession.id,
        endedAt: voiceSession.endedAt.toISOString(),
        endReason: (voiceSession.endReason ??
          "user_ended") as VoiceSessionEndReason
      };
    }

    const updated = await this.prisma.client.voiceSession.update({
      where: { id: voiceSession.id },
      data: {
        endedAt: new Date(),
        endReason: request.reason
      }
    });

    return {
      voiceSessionId: updated.id,
      endedAt: updated.endedAt!.toISOString(),
      endReason: request.reason
    };
  }

  private async findVoiceSession(userId: string, voiceSessionId: string) {
    const voiceSession = await this.prisma.client.voiceSession.findFirst({
      where: { id: voiceSessionId, userId }
    });

    if (!voiceSession) {
      throw new NotFoundException("Voice session not found");
    }

    return voiceSession;
  }

  private async requireLiveVoiceSession(
    userId: string,
    voiceSessionId: string
  ) {
    const voiceSession = await this.findVoiceSession(userId, voiceSessionId);

    if (voiceSession.endedAt) {
      throw new ConflictException("Voice session has ended");
    }

    const limits = voiceSessionLimits();
    const expiresAt = new Date(
      voiceSession.startedAt.getTime() + limits.maxDurationSeconds * 1000
    );

    if (expiresAt <= new Date()) {
      await this.prisma.client.voiceSession.update({
        where: { id: voiceSession.id },
        data: { endedAt: new Date(), endReason: "max_duration" }
      });
      throw new ConflictException("Voice session reached its maximum duration");
    }

    return voiceSession;
  }

  private async resolveChatSession(input: {
    userId: string;
    sessionId?: string;
    startNewThread?: boolean;
  }) {
    if (input.sessionId && !input.startNewThread) {
      const existing = await this.prisma.client.chatSession.findFirst({
        where: { id: input.sessionId, userId: input.userId }
      });

      if (!existing) {
        throw new NotFoundException("Thread not found");
      }

      return existing;
    }

    return this.prisma.client.chatSession.create({
      data: {
        userId: input.userId,
        title: null
      }
    });
  }
}
