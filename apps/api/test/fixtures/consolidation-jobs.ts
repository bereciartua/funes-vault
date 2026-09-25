import { JobStatus, JobType, MemoryStatus, ReviewState } from "@funes-vault/db";
import { Test } from "@nestjs/testing";
import { generateText } from "ai";
import { vi } from "vitest";

import { AuditTrailService } from "../../src/audit-trail/audit-trail.service.js";
import {
  JevMemoryConsolidationProvider,
  LlmMemoryConsolidationProvider
} from "../../src/consolidation/consolidation.providers.js";
import { ConsolidationRepository } from "../../src/consolidation/consolidation.repository.js";
import { ConsolidationCandidatesService } from "../../src/consolidation/consolidation-candidates.service.js";
import { ConsolidationJobService } from "../../src/consolidation/consolidation-job.service.js";
import { ConsolidationLlmService } from "../../src/consolidation/consolidation-llm.service.js";
import { ConsolidationOrchestratorService } from "../../src/consolidation/consolidation-orchestrator.service.js";
import { ConsolidationWriterService } from "../../src/consolidation/consolidation-writer.service.js";
import { EmbeddingJobsService } from "../../src/embeddings/embedding-jobs.service.js";
import { JobsService } from "../../src/jobs/jobs.service.js";
import {
  MemoryProcessingConfigService,
  resolveProcessingConfiguration
} from "../../src/memory-processing/memory-processing-config.service.js";
import { ProcessingPermissionService } from "../../src/memory-processing/processing-permission.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createMemory } from "../factories/index.js";
import { mockAuditTrail as createProvenanceMock } from "../mocks/audit-trail.js";
import { mockPrisma } from "../mocks/prisma.js";
const queue = {
  upsertJobScheduler: vi.fn(),
  removeJobScheduler: vi.fn()
};
export const mockedGenerateText = vi.mocked(generateText);
export function createJobRun(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-06-27T12:00:00.000Z");

  return {
    id: "job_1",
    userId: "user_1",
    type: JobType.CONSOLIDATE_MEMORIES,
    status: JobStatus.QUEUED,
    attempts: 0,
    maxAttempts: 3,
    metadata: {},
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}
export function createPrismaMock() {
  const client = mockPrisma({
    user: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn()
    },
    memory: {
      findMany: vi.fn(),
      findFirst: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve({
          id: where.id,
          reviewState: "APPROVED"
        })
      ),
      update: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve({
          id: where.id,
          reviewState: "APPROVED"
        })
      )
    },
    memorySuggestion: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: `${data.sourceMetadata.reason}_suggestion`,
          ...data,
          status: "QUEUED_FOR_REVIEW",
          createdAt: new Date("2026-06-27T12:00:00.000Z"),
          updatedAt: new Date("2026-06-27T12:00:00.000Z")
        })
      )
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: "audit_1" })
    },
    jobRun: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn()
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (callback) => callback(client))
  });

  return client;
}
export function mockConsolidationMemoryStore(
  prismaClient: ReturnType<typeof createPrismaMock>,
  memories: ReturnType<typeof createMemory>[],
  semanticRows: Array<{ memoryId: string; score: number }> = []
) {
  const byId = new Map(memories.map((memory) => [memory.id, memory]));

  prismaClient.$queryRawUnsafe.mockImplementation((query, ...params) => {
    const sql = String(query);

    if (sql.includes('"consolidationRelevantAt"')) {
      const cutoff = params[1] as Date;

      return Promise.resolve(
        memories
          .filter((memory) => memory.status === MemoryStatus.ACTIVE)
          .filter((memory) => memory.consolidationRelevantAt >= cutoff)
          .filter((memory) => {
            const lastConsolidatedAt = memory.lastConsolidatedAt as Date | null;
            const consolidationRelevantAt = memory.consolidationRelevantAt;

            return (
              !lastConsolidatedAt ||
              lastConsolidatedAt < consolidationRelevantAt
            );
          })
          .sort((left, right) => {
            const leftRelevantAt = left.consolidationRelevantAt;
            const rightRelevantAt = right.consolidationRelevantAt;

            return (
              rightRelevantAt.getTime() - leftRelevantAt.getTime() ||
              left.id.localeCompare(right.id)
            );
          })
          .map((memory) => ({ id: memory.id }))
      );
    }

    if (sql.includes('"expiresAt"')) {
      const now = params[1] as Date;

      return Promise.resolve(
        memories
          .filter((memory) => memory.status === MemoryStatus.ACTIVE)
          .filter((memory) => {
            const expiresAt = memory.expiresAt as Date | null;

            return expiresAt !== null && expiresAt <= now;
          })
          .filter((memory) => {
            const lastConsolidatedAt = memory.lastConsolidatedAt as Date | null;
            const expiresAt = memory.expiresAt as Date | null;

            return (
              expiresAt &&
              (!lastConsolidatedAt || lastConsolidatedAt < expiresAt)
            );
          })
          .sort((left, right) => {
            const leftExpiresAt =
              (left.expiresAt as Date | null)?.getTime() ?? 0;
            const rightExpiresAt =
              (right.expiresAt as Date | null)?.getTime() ?? 0;

            return (
              leftExpiresAt - rightExpiresAt || left.id.localeCompare(right.id)
            );
          })
          .map((memory) => ({ id: memory.id }))
      );
    }

    if (sql.includes("regexp_replace")) {
      const recentMemoryId = params[1] as string;
      const duplicateKey = params[2] as string;

      return Promise.resolve(
        memories
          .filter((memory) => memory.status === MemoryStatus.ACTIVE)
          .filter((memory) => memory.id !== recentMemoryId)
          .filter(
            (memory) =>
              `${memory.title}\n${memory.body}`
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ") === duplicateKey
          )
          .sort(
            (left, right) =>
              right.updatedAt.getTime() - left.updatedAt.getTime() ||
              left.id.localeCompare(right.id)
          )
          .map((memory) => ({ id: memory.id }))
      );
    }

    if (sql.includes("candidate_embeddings")) {
      return Promise.resolve(semanticRows);
    }

    return Promise.resolve([]);
  });

  prismaClient.memory.findMany.mockImplementation(({ where }) => {
    if (where?.id && "in" in where.id) {
      return Promise.resolve(
        where.id.in.map((id: string) => byId.get(id)).filter(Boolean)
      );
    }

    if (where?.title && where?.body) {
      const title = where.title.equals.toLowerCase();
      const body = where.body.equals.toLowerCase();
      const excludedId = where.id?.not;

      return Promise.resolve(
        memories
          .filter((memory) => memory.status === MemoryStatus.ACTIVE)
          .filter((memory) => memory.id !== excludedId)
          .filter(
            (memory) =>
              memory.title.toLowerCase() === title &&
              memory.body.toLowerCase() === body
          )
      );
    }

    if (where?.OR) {
      const excludedId = where.id?.not;
      const terms = where.OR.flatMap(
        (condition: {
          title?: { contains: string };
          body?: { contains: string };
        }) => [condition.title?.contains, condition.body?.contains]
      ).filter(Boolean);

      return Promise.resolve(
        memories
          .filter((memory) => memory.status === MemoryStatus.ACTIVE)
          .filter((memory) => memory.reviewState === ReviewState.APPROVED)
          .filter((memory) => memory.id !== excludedId)
          .filter((memory) =>
            terms.some((term: string) =>
              `${memory.title} ${memory.body}`
                .toLowerCase()
                .includes(term.toLowerCase())
            )
          )
      );
    }

    return Promise.resolve(memories);
  });
}

export async function createJobsHarness() {
  const oldDurableMemory = createMemory({
    id: "old_durable_memory",
    title: "Old preference",
    body: "This preference has not been checked in a long time.",
    updatedAt: new Date("2025-01-01T00:00:00.000Z")
  });
  const expiredMemory = createMemory({
    id: "expired_memory",
    title: "Vacation for the next two weeks",
    body: "The user is on vacation for the next two weeks.",
    expiresAt: new Date("2026-01-15T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  });
  const canonicalMemory = createMemory({
    id: "canonical_memory",
    title: "Duplicate preference",
    body: "Keep this exact memory.",
    updatedAt: new Date("2026-06-27T12:00:00.000Z")
  });
  const duplicateMemory = createMemory({
    id: "duplicate_memory",
    title: "duplicate preference",
    body: "Keep   this exact memory.",
    updatedAt: new Date("2026-06-20T12:00:00.000Z")
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-27T13:00:00.000Z"));
  vi.stubEnv("OPENAI_API_KEY", undefined);
  mockedGenerateText.mockReset();
  const prismaClient: ReturnType<typeof createPrismaMock> = createPrismaMock();
  const provenance: ReturnType<typeof createProvenanceMock> =
    createProvenanceMock();
  mockConsolidationMemoryStore(prismaClient, [
    oldDurableMemory,
    expiredMemory,
    canonicalMemory,
    duplicateMemory
  ]);
  const module = await Test.createTestingModule({
    providers: [
      JobsService,
      ConsolidationJobService,
      ConsolidationOrchestratorService,
      ConsolidationWriterService,
      ConsolidationRepository,
      ConsolidationCandidatesService,
      ConsolidationLlmService,
      LlmMemoryConsolidationProvider,
      { provide: PrismaService, useValue: { client: prismaClient } },
      { provide: AuditTrailService, useValue: provenance },
      {
        provide: EmbeddingJobsService,
        useValue: { enqueueMemoryEmbedding: vi.fn() }
      },
      {
        provide: MemoryProcessingConfigService,
        useValue: {
          get effective() {
            return resolveProcessingConfiguration();
          },
          forUser: vi
            .fn()
            .mockImplementation(async () => resolveProcessingConfiguration())
        }
      },
      { provide: JevMemoryConsolidationProvider, useValue: {} },
      {
        provide: ProcessingPermissionService,
        useValue: {
          check: vi.fn().mockResolvedValue(undefined)
        }
      }
    ]
  }).compile();
  const runner = module.get(ConsolidationOrchestratorService);
  const service: JobsService = module.get(JobsService);

  return {
    prismaClient,
    service,
    runner,
    provenance,
    oldDurableMemory,
    expiredMemory,
    canonicalMemory,
    duplicateMemory
  };
}
export { queue };
