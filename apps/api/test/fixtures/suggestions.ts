import {
  MemoryKind,
  MemorySensitivity,
  MemoryStatus,
  MemorySuggestionStatus,
  PolicyOperation,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import { vi } from "vitest";

import { AuditTrailService } from "../../src/audit-trail/audit-trail.service.js";
import { EmbeddingJobsService } from "../../src/embeddings/embedding-jobs.service.js";
import { suggestionProviders } from "../../src/memory-suggestions/suggestion.providers.js";
import { SuggestionBulkReviewService } from "../../src/memory-suggestions/suggestion-bulk-review.service.js";
import { SuggestionIntakeService } from "../../src/memory-suggestions/suggestion-intake.service.js";
import { SuggestionReviewService } from "../../src/memory-suggestions/suggestion-review.service.js";
import { PolicyEvaluationService } from "../../src/policies/policy-evaluation.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createSuggestion } from "../factories/index.js";
import { mockAuditTrail as createProvenanceMock } from "../mocks/audit-trail.js";
import { createTestModule } from "../mocks/create-service.js";
import { mockPrisma } from "../mocks/prisma.js";
const now = new Date("2026-06-27T12:00:00.000Z");
function createPrismaMock() {
  const suggestion = createSuggestion();
  const client = mockPrisma({
    memoryCategory: {
      findMany: vi.fn().mockResolvedValue([{ key: "software_development" }])
    },
    memorySuggestion: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...suggestion,
          userId: data.userId,
          sourceType: data.sourceType,
          sourceClientId: data.sourceClientId,
          title: data.title,
          body: data.body,
          suggestedKind: data.suggestedKind,
          suggestedSensitivity: data.suggestedSensitivity,
          suggestedCategories: data.suggestedCategories,
          evidence: data.evidence,
          confidence: data.confidence,
          expiresAt: data.expiresAt ?? null,
          status: data.status
        })
      ),
      findMany: vi.fn().mockResolvedValue([suggestion]),
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue(suggestion),
      update: vi.fn().mockResolvedValue({
        ...suggestion,
        status: MemorySuggestionStatus.APPLIED
      })
    },
    memory: {
      create: vi.fn().mockResolvedValue({
        id: "memory_1",
        userId: "user_1",
        kind: MemoryKind.PREFERENCE,
        title: "Uses TypeScript often",
        body: "The user frequently works in TypeScript projects.",
        sensitivity: MemorySensitivity.LOW,
        confidence: 0.72,
        status: MemoryStatus.ACTIVE,
        reviewState: ReviewState.APPROVED,
        sourceType: SourceType.CHAT,
        sourceClientId: null,
        sourceUri: null,
        sourceMetadata: {},
        lastConfirmedAt: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
        categories: [
          {
            id: "category_1",
            key: "software_development",
            name: "Software Development",
            description: null,
            createdAt: now,
            updatedAt: now
          }
        ]
      })
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: "audit_1" })
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (callback) => callback(client))
  });

  return client;
}
export async function createSuggestionsHarness() {
  const prismaClient: ReturnType<typeof createPrismaMock> = createPrismaMock();
  const policyEvaluationService: {
    evaluateForClient: ReturnType<typeof vi.fn>;
  } = {
    evaluateForClient: vi.fn().mockImplementation((_userId, input) => {
      if (input.operation === PolicyOperation.WRITE) {
        return Promise.resolve({
          decision: "DENY",
          policyId: null,
          allowedMemoryIds: [],
          denied: [
            { memoryId: "proposed_memory", reason: "operation_not_allowed" }
          ],
          requiresConfirmation: true,
          reason: "operation_not_allowed"
        });
      }

      return Promise.resolve({
        decision: "ALLOW",
        policyId: "policy_1",
        allowedMemoryIds: ["proposed_memory"],
        denied: [],
        requiresConfirmation: false,
        reason: null
      });
    })
  };
  const provenance: ReturnType<typeof createProvenanceMock> =
    createProvenanceMock();
  const module = await createTestModule(suggestionProviders, [
    { provide: PrismaService, useValue: { client: prismaClient } },
    { provide: PolicyEvaluationService, useValue: policyEvaluationService },
    { provide: AuditTrailService, useValue: provenance },
    {
      provide: EmbeddingJobsService,
      useValue: { enqueueMemoryEmbedding: vi.fn() }
    }
  ]);
  const service = {
    intake: module.get(SuggestionIntakeService),
    review: module.get(SuggestionReviewService),
    bulk: module.get(SuggestionBulkReviewService)
  };

  return { prismaClient, policyEvaluationService, provenance, service };
}
export async function createCaptureHarness() {
  const prismaClient: ReturnType<typeof createPrismaMock> = createPrismaMock();
  prismaClient.memorySuggestion.findFirst.mockResolvedValue(null);
  const policyEvaluationService: {
    evaluateForClient: ReturnType<typeof vi.fn>;
  } = {
    evaluateForClient: vi.fn().mockResolvedValue({
      decision: "ALLOW",
      policyId: "policy_1",
      allowedMemoryIds: ["proposed_memory"],
      denied: [],
      requiresConfirmation: false,
      reason: null
    })
  };
  const provenance: ReturnType<typeof createProvenanceMock> =
    createProvenanceMock();
  const module = await createTestModule(suggestionProviders, [
    { provide: PrismaService, useValue: { client: prismaClient } },
    { provide: PolicyEvaluationService, useValue: policyEvaluationService },
    { provide: AuditTrailService, useValue: provenance },
    {
      provide: EmbeddingJobsService,
      useValue: { enqueueMemoryEmbedding: vi.fn() }
    }
  ]);
  const service = {
    intake: module.get(SuggestionIntakeService),
    review: module.get(SuggestionReviewService),
    bulk: module.get(SuggestionBulkReviewService)
  };

  return { prismaClient, policyEvaluationService, provenance, service };
}
