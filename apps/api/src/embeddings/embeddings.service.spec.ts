import { MemorySensitivity } from "@funes-vault/db";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi
} from "vitest";

import { createMemory } from "../../test/factories/index.js";
import { createService } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { EmbeddingsProvider } from "./embeddings.provider.js";
import { EMBEDDINGS_PROVIDER } from "./embeddings.provider.js";
import { EmbeddingsService } from "./embeddings.service.js";

function createPrismaMock() {
  return mockPrisma({
    memory: {
      findFirst: vi.fn()
    },
    embedding: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null)
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(1)
  });
}

describe("privacy: EmbeddingsService", () => {
  let prismaClient: ReturnType<typeof createPrismaMock>;
  let provider: Omit<EmbeddingsProvider, "generate"> & {
    generate: Mock<EmbeddingsProvider["generate"]>;
  };
  let service: EmbeddingsService;

  beforeEach(async () => {
    vi.stubEnv("EMBEDDINGS_MAX_SENSITIVITY", undefined);
    prismaClient = createPrismaMock();
    provider = {
      provider: "mock",
      model: "mock-embedding",
      generate: vi.fn().mockResolvedValue({
        provider: "mock",
        model: "mock-embedding",
        vector: Array.from({ length: 1536 }, () => 0.01),
        metadata: { mocked: true }
      })
    };
    service = await createService(EmbeddingsService, [
      { provide: PrismaService, useValue: { client: prismaClient } },
      { provide: EMBEDDINGS_PROVIDER, useValue: provider }
    ]);
  });

  it("generates and stores a vector for embeddable memories", async () => {
    prismaClient.memory.findFirst.mockResolvedValue(createMemory());

    const result = await service.generateForMemory({
      userId: "user_1",
      memoryId: "memory_1"
    });

    expect(result.skipped).toBe(false);
    expect(provider.generate).toHaveBeenCalledWith(
      expect.stringContaining("Prefers concise help")
    );
    expect(prismaClient.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "Embedding"'),
      expect.any(String),
      "user_1",
      "memory_1",
      "mock",
      "mock-embedding",
      expect.any(String),
      expect.stringMatching(/^\[/)
    );
  });

  it("generates vectors for restricted memories by default", async () => {
    prismaClient.memory.findFirst.mockResolvedValue(
      createMemory({ sensitivity: MemorySensitivity.RESTRICTED })
    );

    const result = await service.generateForMemory({
      userId: "user_1",
      memoryId: "memory_1"
    });

    expect(result.skipped).toBe(false);
    expect(provider.generate).toHaveBeenCalledWith(
      expect.stringContaining("Prefers concise help")
    );
    expect(prismaClient.embedding.deleteMany).not.toHaveBeenCalled();
  });

  it("honors an operator sensitivity ceiling for embeddings", async () => {
    vi.stubEnv("EMBEDDINGS_MAX_SENSITIVITY", MemorySensitivity.INTERNAL);
    prismaClient.memory.findFirst.mockResolvedValue(
      createMemory({ sensitivity: MemorySensitivity.RESTRICTED })
    );

    const result = await service.generateForMemory({
      userId: "user_1",
      memoryId: "memory_1"
    });

    expect(result).toEqual({
      skipped: true,
      reason: "memory_not_embeddable"
    });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(prismaClient.embedding.deleteMany).toHaveBeenCalledWith({
      where: {
        memoryId: "memory_1",
        provider: "mock",
        model: "mock-embedding"
      }
    });
  });
});

afterEach(() => vi.unstubAllEnvs());
