import {
  MemorySensitivity,
  MemoryStatus,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import type { EmbeddingsProvider } from "../embeddings/embeddings.provider.js";
import { EMBEDDINGS_PROVIDER } from "../embeddings/embeddings.provider.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RetrievalService } from "./retrieval.service.js";

function createMemory(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-07-01T13:34:16.000Z");

  return {
    id: "memory_1",
    userId: "user_1",
    kind: "FACT",
    title: "Memory title",
    body: "Memory body",
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
    consolidationRelevantAt: now,
    lastConsolidatedAt: null,
    createdAt: now,
    updatedAt: now,
    categories: [{ key: "personal_preferences", name: "Personal Preferences" }],
    ...overrides
  };
}

type FindManyArgs = { take?: number; where: { id?: { in?: string[] } } };

describe("privacy: RetrievalService", () => {
  let prismaClient: {
    memory: {
      findMany: ReturnType<
        typeof vi.fn<(args: FindManyArgs) => Promise<unknown>>
      >;
    };
    $queryRawUnsafe: ReturnType<typeof vi.fn>;
  };
  let embeddingsProvider: EmbeddingsProvider & {
    generate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prismaClient = mockPrisma({
      memory: {
        findMany: vi.fn<(args: FindManyArgs) => Promise<unknown>>()
      },
      $queryRawUnsafe: vi.fn()
    });
    embeddingsProvider = {
      provider: "mock",
      model: "mock-embedding",
      generate: vi.fn().mockResolvedValue({
        provider: "mock",
        model: "mock-embedding",
        vector: Array.from({ length: 1536 }, () => 0.01),
        metadata: { mocked: true }
      })
    } satisfies EmbeddingsProvider & { generate: ReturnType<typeof vi.fn> };
  });

  it("keeps exact sensitive keyword matches ahead of weak semantic-only memories", async () => {
    const target = createMemory({
      id: "memory_referral",
      title: "Location of Neck Cyst referral documents",
      body: "The user's Neck Cyst referral documents are in the second drawer of the office.",
      sensitivity: MemorySensitivity.SENSITIVE,
      categories: [{ key: "health", name: "Health" }]
    });
    const vacation = createMemory({
      id: "memory_vacation",
      title: "Vacation for the next two weeks",
      body: "The user will be away for the next two weeks.",
      categories: [{ key: "project_context", name: "Project Context" }]
    });
    const snack = createMemory({
      id: "memory_snack",
      title: "Favorite snack is Lay's",
      body: "The user likes Lay's chips."
    });
    const memories = new Map(
      [target, vacation, snack].map((memory) => [memory.id, memory])
    );

    prismaClient.memory.findMany.mockImplementation((args: FindManyArgs) => {
      if (args.take) {
        return Promise.resolve([target]);
      }

      const ids = args.where.id?.in ?? [];

      return Promise.resolve(
        ids.flatMap((id) => {
          const memory = memories.get(id);

          return memory ? [memory] : [];
        })
      );
    });
    prismaClient.$queryRawUnsafe.mockResolvedValue([
      { memoryId: "memory_vacation", score: 0.25 },
      { memoryId: "memory_snack", score: 0.23 }
    ]);

    const service = await createService(RetrievalService, [
      { provide: PrismaService, useValue: { client: prismaClient } },
      { provide: EMBEDDINGS_PROVIDER, useValue: embeddingsProvider }
    ]);
    const result = await service.retrieve({
      userId: "user_1",
      task: "Find any memories that mention referral papers, referrals, documents, paperwork, or related context that could help locate or identify what the user means by 'those referral papers'.",
      requestedCategories: [
        "project_context",
        "health",
        "legal",
        "personal_preferences"
      ]
    });

    expect(result.map((memory) => memory.id)).toEqual([
      "memory_referral",
      "memory_vacation",
      "memory_snack"
    ]);
    expect(result[0]?.relevanceScore).toBeGreaterThan(
      result[1]?.relevanceScore ?? 0
    );
  });
  it("retrieves accented and non-Latin keywords without treating filler as query terms", async () => {
    const target = createMemory({
      title: "Café Zürich",
      body: "東京都 旅行記"
    });
    prismaClient.memory.findMany.mockResolvedValue([target]);
    prismaClient.$queryRawUnsafe.mockResolvedValue([]);
    const service = await createService(RetrievalService, [
      { provide: PrismaService, useValue: { client: prismaClient } },
      { provide: EMBEDDINGS_PROVIDER, useValue: embeddingsProvider }
    ]);
    const result = await service.retrieve({
      userId: "user_1",
      task: "Please remember café Zürich 東京都 旅行記",
      requestedCategories: []
    });
    expect(result.map((memory) => memory.id)).toEqual([target.id]);
    const terms = ["café", "zürich", "東京都", "旅行記"];
    expect(prismaClient.memory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user_1",
          OR: terms.flatMap((term) => [
            { title: { contains: term, mode: "insensitive" } },
            { body: { contains: term, mode: "insensitive" } }
          ])
        })
      })
    );
    expect(result[0]?.relevanceScore).toBe(0.9);
  });
});
