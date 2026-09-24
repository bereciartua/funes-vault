import {
  AuditEventType,
  MemoryRequestStatus,
  MemorySensitivity,
  MemoryStatus,
  MemorySuggestionStatus,
  PolicyOperation,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import {
  createMemoryBundleRequestSchema,
  createMemorySuggestionRequestSchema
} from "@funes-vault/shared";
import { describe, expect, it, vi } from "vitest";

import { AuditTrailService } from "../../src/audit-trail/audit-trail.service.js";
import { EmbeddingJobsService } from "../../src/embeddings/embedding-jobs.service.js";
import type { EmbeddingsProvider } from "../../src/embeddings/embeddings.provider.js";
import { EmbeddingsService } from "../../src/embeddings/embeddings.service.js";
import { MemoryRequestsService } from "../../src/memory-requests/memory-requests.service.js";
import { suggestionProviders } from "../../src/memory-suggestions/suggestion.providers.js";
import { SuggestionIntakeService } from "../../src/memory-suggestions/suggestion-intake.service.js";
import {
  evaluateCandidateMemories,
  PolicyEvaluationService
} from "../../src/policies/policy-evaluation.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { mockAuditTrail as createProvenanceMock } from "../mocks/audit-trail.js";
import { createService } from "../mocks/create-service.js";

const now = new Date("2026-06-27T12:00:00.000Z");

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "memory_1",
    sensitivity: MemorySensitivity.LOW,
    status: MemoryStatus.ACTIVE,
    reviewState: ReviewState.APPROVED,
    expiresAt: null,
    categories: [{ key: "software_development" }],
    ...overrides
  };
}

function policy(overrides: Record<string, unknown> = {}) {
  return {
    id: "policy_1",
    maxSensitivity: MemorySensitivity.INTERNAL,
    operations: [PolicyOperation.READ],
    requiresConfirmation: false,
    expiresAt: null,
    allowedCategories: [{ key: "software_development" }],
    deniedCategories: [],
    ...overrides
  };
}

function embeddableMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: "memory_1",
    userId: "user_1",
    kind: "PREFERENCE",
    title: "Prefers concise help",
    body: "The user prefers concise implementation help.",
    sensitivity: MemorySensitivity.LOW,
    confidence: 1,
    status: MemoryStatus.ACTIVE,
    reviewState: ReviewState.APPROVED,
    sourceType: SourceType.MANUAL,
    sourceClientId: null,
    sourceUri: null,
    sourceMetadata: {},
    lastConfirmedAt: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    categories: [{ key: "communication_style", name: "Communication Style" }],
    ...overrides
  };
}

describe("privacy: privacy acceptance tests", () => {
  it("does not include restricted memories in a normal bundle", () => {
    const result = evaluateCandidateMemories({
      policy: policy(),
      candidateMemories: [
        candidate({
          id: "restricted_memory",
          sensitivity: MemorySensitivity.RESTRICTED
        })
      ],
      now
    });

    expect(result.decision).toBe("DENY");
    expect(result.allowedMemoryIds).toEqual([]);
    expect(result.denied).toEqual([
      {
        memoryId: "restricted_memory",
        reason: "above_sensitivity_ceiling"
      }
    ]);
  });

  it("lets a denied category override an allowed broad request", () => {
    const result = evaluateCandidateMemories({
      policy: policy({
        allowedCategories: [
          { key: "software_development" },
          { key: "finance" }
        ],
        deniedCategories: [{ key: "finance" }]
      }),
      candidateMemories: [candidate({ categories: [{ key: "finance" }] })],
      now
    });

    expect(result.decision).toBe("DENY");
    expect(result.denied).toEqual([
      { memoryId: "memory_1", reason: "denied_category" }
    ]);
  });

  it("keeps a chat-generated suggestion inactive until approved", async () => {
    const prismaClient = {
      memoryCategory: {
        findMany: vi.fn().mockResolvedValue([{ key: "software_development" }])
      },
      memorySuggestion: {
        create: vi.fn().mockResolvedValue({
          id: "suggestion_1",
          userId: "user_1",
          sourceType: SourceType.CHAT,
          sourceClientId: null,
          title: "Uses TypeScript often",
          body: "The user frequently works in TypeScript projects.",
          suggestedKind: "PREFERENCE",
          suggestedSensitivity: MemorySensitivity.LOW,
          suggestedCategories: ["software_development"],
          evidence: null,
          sourceMetadata: {},
          confidence: 0.72,
          expiresAt: null,
          status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
          createdAt: now,
          updatedAt: now
        })
      },
      memory: {
        create: vi.fn()
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit_1" })
      },
      $transaction: vi.fn(async (callback) => callback(prismaClient))
    };
    const provenance = createProvenanceMock();
    const service = await createService(
      SuggestionIntakeService,
      [
        { provide: PrismaService, useValue: { client: prismaClient } },
        {
          provide: PolicyEvaluationService,
          useValue: { evaluateForClient: vi.fn() }
        },
        { provide: AuditTrailService, useValue: provenance },
        {
          provide: EmbeddingJobsService,
          useValue: { enqueueMemoryEmbedding: vi.fn() }
        }
      ],
      suggestionProviders
    );

    const response = await service.createUserSuggestion({
      userId: "user_1",
      body: createMemorySuggestionRequestSchema.parse({
        purpose: "memory_chat",
        kind: "preference",
        title: "Uses TypeScript often",
        body: "The user frequently works in TypeScript projects.",
        categoryKeys: ["software_development"],
        confidence: 0.72
      })
    });

    expect(response.suggestion.status).toBe(
      MemorySuggestionStatus.QUEUED_FOR_REVIEW
    );
    expect(prismaClient.memory.create).not.toHaveBeenCalled();
    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        type: AuditEventType.MEMORY_SUGGESTION_CREATED
      })
    );
  });

  it("creates an audit event for an MCP memory request path", async () => {
    const prismaClient = {
      memory: { findMany: vi.fn().mockResolvedValue([embeddableMemory()]) },
      memoryRequest: {
        create: vi.fn().mockResolvedValue({ id: "request_1" }),
        update: vi.fn().mockResolvedValue({})
      },
      memoryRequestItem: {
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit_1" })
      },
      $transaction: vi.fn(async (callback) => callback(prismaClient))
    };
    const provenance = createProvenanceMock();
    const service = new MemoryRequestsService(
      { client: prismaClient } as never,
      {
        retrieve: vi.fn().mockResolvedValue([
          {
            ...embeddableMemory(),
            categories: [{ key: "software_development", name: "Development" }],
            relevanceScore: 0.9
          }
        ])
      } as never,
      {
        evaluateForClient: vi.fn().mockResolvedValue({
          decision: "ALLOW",
          policyId: "policy_1",
          allowedMemoryIds: ["memory_1"],
          denied: [],
          requiresConfirmation: false,
          reason: null
        })
      } as never,
      {
        compile: vi.fn().mockReturnValue({
          items: [
            {
              memoryId: "memory_1",
              text: "Prefers concise help",
              category: "software_development",
              sensitivity: MemorySensitivity.LOW,
              relevanceScore: 0.9,
              estimatedTokens: 8
            }
          ],
          estimatedTokens: 8,
          instructions: ["Use this context only for the declared task."]
        })
      } as never,
      provenance as never
    );

    const response = await service.createBundleRequest({
      userId: "user_1",
      clientId: "client_1",
      body: createMemoryBundleRequestSchema.parse({
        purpose: "Help review the repository",
        task: "Help with this repository"
      })
    });

    expect(response.status).toBe(MemoryRequestStatus.FULFILLED);
    expect(response.auditEventId).toBe("audit_1");
    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        clientId: "client_1",
        memoryRequestId: "request_1",
        type: AuditEventType.MEMORY_DISCLOSURE,
        metadata: expect.objectContaining({
          memoryIds: ["memory_1"]
        })
      })
    );
  });

  it("uses a mocked embedding provider and records provider metadata", async () => {
    const prismaClient = {
      memory: {
        findFirst: vi.fn().mockResolvedValue(embeddableMemory())
      },
      embedding: {
        deleteMany: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null)
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1)
    };
    const provider = {
      provider: "openai",
      model: "text-embedding-3-small",
      generate: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "text-embedding-3-small",
        vector: Array.from({ length: 1536 }, () => 0.01),
        metadata: { requestId: "mock_openai_request" }
      })
    } satisfies EmbeddingsProvider & { generate: ReturnType<typeof vi.fn> };
    const service = new EmbeddingsService(
      { client: prismaClient } as never,
      provider
    );

    const result = await service.generateForMemory({
      userId: "user_1",
      memoryId: "memory_1"
    });

    expect(provider.generate).toHaveBeenCalledWith(
      expect.stringContaining("Prefers concise help")
    );
    expect(result).toEqual(
      expect.objectContaining({
        skipped: false,
        provider: "openai",
        model: "text-embedding-3-small",
        metadata: { requestId: "mock_openai_request" }
      })
    );
  });
});
