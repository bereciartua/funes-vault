import {
  AuditEventType,
  MemorySensitivity,
  MemoryStatus
} from "@funes-vault/db";
import {
  createMemoryRequestSchema,
  listMemoriesQuerySchema,
  updateMemoryRequestSchema
} from "@funes-vault/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemory } from "../../test/factories/index.js";
import {
  createEmbeddingsProvider,
  createMemoriesHarness,
  createMemoriesService
} from "../../test/fixtures/memories.js";
afterEach(() => vi.unstubAllEnvs());
describe("privacy: MemoriesService", () => {
  let prismaClient: Awaited<
    ReturnType<typeof createMemoriesHarness>
  >["prismaClient"];
  let service: Awaited<ReturnType<typeof createMemoriesHarness>>["service"];
  let embeddingJobs: Awaited<
    ReturnType<typeof createMemoriesHarness>
  >["embeddingJobs"];
  let provenance: Awaited<
    ReturnType<typeof createMemoriesHarness>
  >["provenance"];
  beforeEach(async () => {
    ({ prismaClient, service, embeddingJobs, provenance } =
      await createMemoriesHarness());
  });

  it("scopes list queries to the current user and excludes deleted memories by default", async () => {
    prismaClient.memory.count.mockResolvedValue(1);
    prismaClient.memory.findMany.mockResolvedValue([createMemory()]);

    await service.listMemories(
      "user_1",
      listMemoriesQuerySchema.parse({
        query: "concise",
        categoryKeys: "communication_style"
      })
    );

    expect(prismaClient.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user_1",
          status: { not: MemoryStatus.DELETED },
          OR: [
            { title: { contains: "concise", mode: "insensitive" } },
            { body: { contains: "concise", mode: "insensitive" } }
          ],
          categories: {
            some: {
              key: { in: ["communication_style"] }
            }
          }
        })
      })
    );
    expect(prismaClient.memory.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user_1" })
      })
    );
  });
  it("clamps out-of-range memory pages to the final matching page", async () => {
    prismaClient.memory.count.mockResolvedValue(26);
    prismaClient.memory.findMany.mockResolvedValue([
      createMemory({ id: "memory_26" })
    ]);

    const response = await service.listMemories(
      "user_1",
      listMemoriesQuerySchema.parse({
        page: "999",
        limit: "25"
      })
    );

    expect(prismaClient.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user_1" }),
        skip: 25,
        take: 25
      })
    );
    expect(response.pagination).toEqual({
      page: 2,
      limit: 25,
      total: 26,
      totalPages: 2
    });
  });
  it("adds semantic similarity to list search for short meaning-based queries", async () => {
    const provider = createEmbeddingsProvider();
    service = await createMemoriesService({
      prisma: { client: prismaClient },
      provenance: provenance,
      embeddingJobs: embeddingJobs,
      provider: provider
    });
    prismaClient.$queryRawUnsafe
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([
        { memoryId: "memory_semantic" },
        { memoryId: "memory_keyword" }
      ]);
    prismaClient.memory.findMany.mockResolvedValue([
      createMemory({
        id: "memory_keyword",
        title: "TypeScript preferences"
      }),
      createMemory({
        id: "memory_semantic",
        title: "Architecture preferences",
        body: "The user likes strongly typed application boundaries."
      })
    ]);

    const response = await service.listMemories(
      "user_1",
      listMemoriesQuerySchema.parse({
        query: "typescript architecture",
        categoryKeys: "software_development",
        page: "1",
        limit: "10"
      })
    );

    expect(provider.generate).toHaveBeenCalledWith("typescript architecture");
    expect(prismaClient.memory.count).not.toHaveBeenCalled();
    expect(prismaClient.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    const countCall = prismaClient.$queryRawUnsafe.mock.calls[0];
    expect(countCall).toBeDefined();
    expect(countCall?.[0]).toContain("LEFT JOIN LATERAL");
    expect(countCall).toEqual(
      expect.arrayContaining([
        "user_1",
        "typescript architecture",
        expect.stringMatching(/^\[/),
        "mock",
        "mock-embedding",
        0.3,
        expect.arrayContaining([
          MemorySensitivity.PUBLIC,
          MemorySensitivity.LOW,
          MemorySensitivity.INTERNAL,
          MemorySensitivity.SENSITIVE,
          MemorySensitivity.RESTRICTED,
          MemorySensitivity.SECRET
        ]),
        ["software_development"]
      ])
    );
    expect(response.items.map((memory) => memory.id)).toEqual([
      "memory_semantic",
      "memory_keyword"
    ]);
  });
  it("falls back to local keyword search for secret-like search text", async () => {
    const provider = createEmbeddingsProvider();
    service = await createMemoriesService({
      prisma: { client: prismaClient },
      provenance: provenance,
      embeddingJobs: embeddingJobs,
      provider: provider
    });
    prismaClient.memory.count.mockResolvedValue(1);
    prismaClient.memory.findMany.mockResolvedValue([createMemory()]);

    await service.listMemories(
      "user_1",
      listMemoriesQuerySchema.parse({
        query: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456"
      })
    );

    expect(provider.generate).not.toHaveBeenCalled();
    expect(prismaClient.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prismaClient.memory.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user_1" })
      })
    );
  });
  it("creates a memory with validated categories and an audit event", async () => {
    prismaClient.memoryCategory.findMany.mockResolvedValue([
      { key: "communication_style" }
    ]);
    prismaClient.memory.create.mockResolvedValue(createMemory());

    const response = await service.createMemory(
      "user_1",
      createMemoryRequestSchema.parse({
        kind: "PREFERENCE",
        title: "Prefers concise help",
        body: "The user prefers concise implementation help.",
        categoryKeys: ["communication_style"]
      })
    );

    expect(response.memory.categoryKeys).toEqual(["communication_style"]);
    expect(prismaClient.memory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          categories: {
            connect: [{ key: "communication_style" }]
          }
        })
      })
    );
    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        type: AuditEventType.MEMORY_CREATED,
        actorType: "USER",
        actorId: "user_1",
        metadata: { memoryId: "memory_1" }
      })
    );
    expect(embeddingJobs.enqueueMemoryEmbedding).toHaveBeenCalledWith({
      userId: "user_1",
      memoryId: "memory_1",
      reason: "memory_created"
    });
  });
  it("advances the consolidation-relevant timestamp for user-facing edits", async () => {
    prismaClient.memory.findFirst.mockResolvedValue({
      id: "memory_1",
      status: MemoryStatus.ACTIVE
    });
    prismaClient.memory.update.mockResolvedValue(
      createMemory({
        body: "The user prefers concise implementation help with examples."
      })
    );

    await service.updateMemory(
      "user_1",
      "memory_1",
      updateMemoryRequestSchema.parse({
        body: "The user prefers concise implementation help with examples."
      })
    );

    expect(prismaClient.memory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: "The user prefers concise implementation help with examples.",
          consolidationRelevantAt: expect.any(Date)
        })
      })
    );
  });
  it("does not advance the consolidation-relevant timestamp for archive-only updates", async () => {
    prismaClient.memory.findFirst.mockResolvedValue({
      id: "memory_1",
      status: MemoryStatus.ACTIVE
    });
    prismaClient.memory.update.mockResolvedValue(
      createMemory({
        status: MemoryStatus.ARCHIVED
      })
    );

    await service.updateMemory(
      "user_1",
      "memory_1",
      updateMemoryRequestSchema.parse({
        status: MemoryStatus.ARCHIVED
      })
    );

    expect(prismaClient.memory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          consolidationRelevantAt: expect.any(Date)
        })
      })
    );
  });
});
