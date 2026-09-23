import { Test } from "@nestjs/testing";
import { vi } from "vitest";

import { AuditTrailService } from "../../src/audit-trail/audit-trail.service.js";
import { EmbeddingJobsService } from "../../src/embeddings/embedding-jobs.service.js";
import type { EmbeddingsProvider } from "../../src/embeddings/embeddings.provider.js";
import { EMBEDDINGS_PROVIDER } from "../../src/embeddings/embeddings.provider.js";
import { CategoriesService } from "../../src/memories/categories.service.js";
import { MemoriesService } from "../../src/memories/memories.service.js";
import { MemoryProvenanceRecorder } from "../../src/memories/memory-provenance-recorder.js";
import { MemorySearchRepository } from "../../src/memories/memory-search.repository.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { mockAuditTrail as createProvenanceMock } from "../mocks/audit-trail.js";
import { mockPrisma } from "../mocks/prisma.js";
export function createPrismaMock() {
  const client = mockPrisma({
    memory: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    memoryCategory: {
      findMany: vi.fn()
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({})
    },
    $transaction: vi.fn(async (callback) => callback(client)),
    $queryRawUnsafe: vi.fn().mockResolvedValue([])
  });

  return client;
}
export function createEmbeddingsProvider() {
  return {
    provider: "mock",
    model: "mock-embedding",
    generate: vi.fn().mockResolvedValue({
      provider: "mock",
      model: "mock-embedding",
      vector: Array.from({ length: 1536 }, () => 0.01),
      metadata: { mocked: true }
    })
  } satisfies EmbeddingsProvider & { generate: ReturnType<typeof vi.fn> };
}
export async function createMemoriesService(input: {
  prisma: { client: ReturnType<typeof createPrismaMock> };
  provenance: ReturnType<typeof createProvenanceMock>;
  embeddingJobs: { enqueueMemoryEmbedding: ReturnType<typeof vi.fn> };
  provider?: EmbeddingsProvider;
}) {
  const module = await Test.createTestingModule({
    providers: [
      MemoriesService,
      CategoriesService,
      MemorySearchRepository,
      MemoryProvenanceRecorder,
      { provide: PrismaService, useValue: input.prisma },
      { provide: AuditTrailService, useValue: input.provenance },
      { provide: EmbeddingJobsService, useValue: input.embeddingJobs },
      {
        provide: EMBEDDINGS_PROVIDER,
        useValue: input.provider ?? {
          provider: "disabled",
          model: "disabled",
          generate: () =>
            Promise.reject(new Error("Embeddings disabled in this fixture"))
        }
      }
    ]
  }).compile();

  return module.get(MemoriesService);
}
export async function createMemoriesHarness() {
  vi.stubEnv("EMBEDDINGS_MAX_SENSITIVITY", undefined);
  const prismaClient: ReturnType<typeof createPrismaMock> = createPrismaMock();
  const provenance: ReturnType<typeof createProvenanceMock> =
    createProvenanceMock();
  const embeddingJobs: {
    enqueueMemoryEmbedding: ReturnType<typeof vi.fn>;
  } = {
    enqueueMemoryEmbedding: vi.fn().mockResolvedValue({
      jobRunId: "job_1",
      queued: true
    })
  };
  const service: MemoriesService = await createMemoriesService({
    prisma: { client: prismaClient },
    provenance: provenance,
    embeddingJobs: embeddingJobs
  });

  return { prismaClient, service, embeddingJobs, provenance };
}
