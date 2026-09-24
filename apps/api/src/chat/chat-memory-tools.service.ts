import {
  ClientRetention,
  MemoryStatus,
  MemorySuggestionStatus
} from "@funes-vault/db";
import {
  type ChatCitation,
  createMemorySuggestionRequestSchema,
  listMemoriesQuerySchema,
  updateMemoryRequestSchema
} from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { parseRequest } from "../common/zod.js";
import { apiEnv } from "../config.js";
import {
  FirstPartyAccessService,
  voicePurpose,
  webChatPurpose
} from "../first-party-access/first-party-access.service.js";
import { MemoriesService } from "../memories/memories.service.js";
import { toMemoryResponse } from "../memories/memory.mapper.js";
import { memoryInclude } from "../memories/memory.types.js";
import {
  reconciliationTerms,
  termFilters
} from "../memory-processing/reconciliation.js";
import { type CompiledBundleItem } from "../memory-requests/bundle-compiler.service.js";
import { MemoryRequestsService } from "../memory-requests/memory-requests.service.js";
import { toMemorySuggestionResponse } from "../memory-suggestions/memory-suggestion.mapper.js";
import { SuggestionIntakeService } from "../memory-suggestions/suggestion-intake.service.js";
import { SuggestionReviewService } from "../memory-suggestions/suggestion-review.service.js";
import { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const chatTokenBudget = 1200;

export type StewardChannel = "chat" | "voice";

export type MemoryToolBundle = {
  reason: import("@funes-vault/shared").MemoryRequestReason | null;
  requestId: string;
  status: string;
  policyId: string | null;
  tokenBudget: number;
  estimatedTokens: number;
  items: CompiledBundleItem[];
  citations: ChatCitation[];
  denied: Array<{ memoryId: string; reason: string }>;
  auditEventId: string | null;
};

/**
 * Adapts owner chat and voice tools to first-party clients, policy evaluation and memory
 * services. Intake is normalized through shared contracts. Domain collaborators perform audited
 * writes and disclosure.
 */
@Injectable()
export class ChatMemoryToolsService {
  constructor(
    private readonly firstPartyAccess: FirstPartyAccessService,
    private readonly prisma: PrismaService,
    private readonly memoryRequestsService: MemoryRequestsService,
    private readonly suggestionIntakeService: SuggestionIntakeService,
    private readonly suggestionReviewService: SuggestionReviewService,
    private readonly memoriesService: MemoriesService,
    private readonly evaluator: PolicyEvaluationService
  ) {}

  async requestMemory(input: {
    userId: string;
    channel?: StewardChannel;
    requestedCategories?: string[];
    task: string;
    tokenBudget?: number;
  }): Promise<MemoryToolBundle> {
    const clientId = await this.ensureChannelClient(
      input.userId,
      input.channel
    );
    const bundle = await this.memoryRequestsService.createBundleRequest({
      userId: input.userId,
      clientId,
      body: {
        purpose: purposeForChannel(input.channel),
        task: input.task,
        requestedCategories: input.requestedCategories ?? [],
        retention: ClientRetention.NO_STORAGE,
        thirdPartyProcessors: apiEnv().OPENAI_API_KEY ? ["openai"] : [],
        tokenBudget: input.tokenBudget ?? chatTokenBudget
      }
    });

    return {
      requestId: bundle.requestId,
      status: bundle.status,
      policyId: bundle.policyId,
      reason: bundle.reason,
      tokenBudget: bundle.tokenBudget,
      estimatedTokens: bundle.estimatedTokens,
      items: bundle.items,
      citations: await this.toCitations(input.userId, bundle.items),
      denied: bundle.denied,
      auditEventId: bundle.auditEventId
    };
  }

  async suggestMemory(input: {
    userId: string;
    channel?: StewardChannel;
    title: string;
    body: string;
    kind: string;
    sensitivity: string;
    categoryKeys: string[];
    evidence: string;
    confidence: number;
    expiresAt?: string | null;
  }) {
    const clientId = await this.ensureChannelClient(
      input.userId,
      input.channel
    );

    const gate = await this.evaluator.evaluateForClient(input.userId, {
      clientId,
      operation: "SUGGEST"
    });
    const write =
      gate.decision === "DENY" && input.channel !== "voice"
        ? await this.evaluator.evaluateForClient(input.userId, {
            clientId,
            operation: "WRITE"
          })
        : null;
    if (gate.decision === "DENY" && write?.decision !== "ALLOW") {
      return {
        ...(await this.suggestionIntakeService.createSuggestion({
          userId: input.userId,
          clientId,
          reviewOnly: input.channel === "voice",
          body: parseRequest(createMemorySuggestionRequestSchema, {
            ...input,
            purpose: purposeForChannel(input.channel)
          })
        })),
        deduplicated: false
      };
    }

    // The model can occasionally repeat a tool call for a claim from an
    // earlier turn (for example, after the user replies "awesome"). Keep the
    // chat/voice boundary idempotent even when that happens. This lookup stays
    // inside the authenticated first-party path so it does not expose memory
    // existence to external suggestion clients.
    const existingMemory = await this.prisma.client.memory.findFirst({
      where: {
        userId: input.userId,
        status: MemoryStatus.ACTIVE,
        title: { equals: input.title, mode: "insensitive" },
        body: { equals: input.body, mode: "insensitive" },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      select: { id: true }
    });

    if (existingMemory) {
      return {
        suggestionId: null,
        memoryId: existingMemory.id,
        status: MemorySuggestionStatus.APPLIED,
        policyId: gate.policyId,
        reason: null,
        auditEventId: null,
        decision: "ALLOW" as const,
        denied: [],
        deduplicated: true
      };
    }

    const existingSuggestion =
      await this.prisma.client.memorySuggestion.findFirst({
        where: {
          userId: input.userId,
          status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
          title: { equals: input.title, mode: "insensitive" },
          body: { equals: input.body, mode: "insensitive" },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        select: { id: true }
      });

    if (existingSuggestion) {
      return {
        suggestionId: existingSuggestion.id,
        memoryId: null,
        status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
        policyId: gate.policyId,
        reason: null,
        auditEventId: null,
        decision: "NEEDS_CONFIRMATION" as const,
        denied: [],
        deduplicated: true
      };
    }

    const response = await this.suggestionIntakeService.createSuggestion({
      userId: input.userId,
      clientId,
      reviewOnly: input.channel === "voice",
      body: parseRequest(createMemorySuggestionRequestSchema, {
        purpose: purposeForChannel(input.channel),
        kind: input.kind,
        title: input.title,
        body: input.body,
        categoryKeys: input.categoryKeys,
        sensitivity: input.sensitivity,
        evidence: input.evidence,
        confidence: input.confidence,
        expiresAt: input.expiresAt ?? null,
        sourceMetadata: {
          origin:
            input.channel === "voice" ? "memory_voice_tool" : "memory_chat_tool"
        }
      })
    });

    return { ...response, deduplicated: false };
  }

  async searchMemories(input: {
    userId: string;
    query: string;
    categoryKeys?: string[];
    limit?: number;
  }) {
    // Tool arguments come from the model; validate them the same way the
    // HTTP boundary does before handing the service a typed query.
    const response = await this.memoriesService.listMemories(
      input.userId,
      parseRequest(listMemoriesQuerySchema, {
        query: input.query,
        categoryKeys: input.categoryKeys,
        status: MemoryStatus.ACTIVE,
        limit: input.limit ?? 8,
        page: 1
      })
    );
    if (response.items.length) {
      return response;
    }
    const terms = reconciliationTerms(input.query);
    if (!terms.length) {
      return response;
    }
    const items = await this.prisma.client.memory.findMany({
      where: {
        userId: input.userId,
        status: MemoryStatus.ACTIVE,
        OR: termFilters(terms)
      },
      include: memoryInclude,
      orderBy: { updatedAt: "desc" },
      take: input.limit ?? 8
    });

    return { ...response, items: items.map(toMemoryResponse) };
  }

  async updateMemory(input: {
    userId: string;
    memoryId: string;
    title?: string;
    body?: string;
    kind?: string;
    sensitivity?: string;
    categoryKeys?: string[];
    confidence?: number;
  }) {
    return this.memoriesService.updateMemory(
      input.userId,
      input.memoryId,
      parseRequest(updateMemoryRequestSchema, {
        title: input.title,
        body: input.body,
        kind: input.kind,
        sensitivity: input.sensitivity,
        categoryKeys: input.categoryKeys,
        confidence: input.confidence
      })
    );
  }

  async archiveMemory(input: {
    userId: string;
    memoryId: string;
    reason: string;
  }) {
    return this.memoriesService.updateMemory(
      input.userId,
      input.memoryId,
      parseRequest(updateMemoryRequestSchema, {
        status: MemoryStatus.ARCHIVED
      })
    );
  }

  async listQueuedSuggestions(input: {
    userId: string;
    query?: string;
    limit?: number;
  }) {
    const terms = reconciliationTerms(input.query ?? "");
    if (!terms.length) {
      return this.suggestionReviewService.listUserSuggestions(input.userId, {
        status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
        limit: input.limit ?? 8,
        page: 1
      });
    }
    const items = await this.prisma.client.memorySuggestion.findMany({
      where: {
        userId: input.userId,
        status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
        OR: termFilters(terms)
      },
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 8
    });

    return { items: items.map((item) => toMemorySuggestionResponse(item)) };
  }

  async rejectSuggestion(input: { userId: string; suggestionId: string }) {
    return this.suggestionReviewService.rejectUserSuggestion(
      input.userId,
      input.suggestionId
    );
  }

  private async ensureChannelClient(
    userId: string,
    channel: StewardChannel = "chat"
  ) {
    const access =
      channel === "voice"
        ? await this.firstPartyAccess.ensureVoiceAccess(userId)
        : await this.firstPartyAccess.ensureWebChatAccess(userId);

    return access.clientId;
  }

  private async toCitations(
    userId: string,
    items: CompiledBundleItem[]
  ): Promise<ChatCitation[]> {
    if (items.length === 0) {
      return [];
    }

    const memoryIds = items.map((item) => item.memoryId);
    const memories = await this.prisma.client.memory.findMany({
      where: { id: { in: memoryIds }, userId },
      include: {
        categories: {
          select: { key: true },
          orderBy: { name: "asc" }
        }
      }
    });
    const byId = new Map(memories.map((memory) => [memory.id, memory]));

    return items
      .map((item) => {
        const memory = byId.get(item.memoryId);

        if (!memory) {
          return null;
        }

        return {
          memoryId: item.memoryId,
          title: memory.title,
          categoryKeys: memory.categories.map((category) => category.key),
          sensitivity: item.sensitivity,
          relevanceScore: item.relevanceScore
        };
      })
      .filter((citation): citation is ChatCitation => citation !== null);
  }
}

function purposeForChannel(channel: StewardChannel = "chat") {
  return channel === "voice" ? voicePurpose : webChatPurpose;
}
