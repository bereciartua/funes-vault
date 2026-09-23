import { createHash, randomUUID } from "node:crypto";

import {
  type Memory,
  type MemoryCategory,
  MemoryStatus,
  ReviewState
} from "@funes-vault/db";
import { EMBEDDING_DIMENSIONS } from "@funes-vault/shared";
import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import {
  type EmbeddingsProvider,
  InjectEmbeddingsProvider,
  shouldEmbedSensitivity
} from "./embeddings.provider.js";

type EmbeddableMemory = Memory & {
  categories: Pick<MemoryCategory, "key" | "name">[];
};

/**
 * Loads a memory by owner, applies the configured sensitivity ceiling and persists its provider
 * embedding. The queue runner audits job outcomes; this service performs no audit writes.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectEmbeddingsProvider()
    private readonly provider: EmbeddingsProvider
  ) {}

  async generateForMemory(input: {
    userId: string;
    memoryId: string;
    jobRunId?: string;
  }) {
    const memory = await this.prisma.client.memory.findFirst({
      where: { id: input.memoryId, userId: input.userId },
      include: {
        categories: {
          select: { key: true, name: true },
          orderBy: { name: "asc" }
        }
      }
    });

    if (!memory) {
      throw new Error("Memory not found for embedding generation");
    }

    if (!this.isEmbeddable(memory)) {
      await this.prisma.client.embedding.deleteMany({
        where: {
          memoryId: memory.id,
          provider: this.provider.provider,
          model: this.provider.model
        }
      });

      return { skipped: true, reason: "memory_not_embeddable" };
    }

    const text = buildMemoryEmbeddingText(memory);
    const contentHash = hashText(text);
    const existing = await this.prisma.client.embedding.findFirst({
      where: {
        memoryId: memory.id,
        provider: this.provider.provider,
        model: this.provider.model,
        contentHash
      },
      select: { id: true }
    });

    if (existing) {
      return { skipped: true, reason: "embedding_already_current" };
    }

    const generated = await this.provider.generate(text);

    if (generated.vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Expected ${EMBEDDING_DIMENSIONS} embedding dimensions, got ${generated.vector.length}`
      );
    }

    await this.upsertEmbedding({
      userId: memory.userId,
      memoryId: memory.id,
      provider: generated.provider,
      model: generated.model,
      contentHash,
      vector: generated.vector
    });

    this.logger.debug(
      `Generated embedding for memory ${memory.id} with ${generated.provider}/${generated.model}`
    );

    return {
      skipped: false,
      provider: generated.provider,
      model: generated.model,
      contentHash,
      metadata: generated.metadata
    };
  }

  private isEmbeddable(memory: EmbeddableMemory) {
    return (
      memory.status === MemoryStatus.ACTIVE &&
      memory.reviewState === ReviewState.APPROVED &&
      shouldEmbedSensitivity(memory.sensitivity)
    );
  }

  private async upsertEmbedding(input: {
    userId: string;
    memoryId: string;
    provider: string;
    model: string;
    contentHash: string;
    vector: number[];
  }) {
    const vectorLiteral = toVectorLiteral(input.vector);

    await this.prisma.client.$executeRawUnsafe(
      `
        INSERT INTO "Embedding" ("id", "userId", "memoryId", "provider", "model", "contentHash", "vector", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7::vector, now(), now())
        ON CONFLICT ("memoryId", "provider", "model", "contentHash")
        DO UPDATE SET "vector" = EXCLUDED."vector", "updatedAt" = now()
      `,
      randomUUID(),
      input.userId,
      input.memoryId,
      input.provider,
      input.model,
      input.contentHash,
      vectorLiteral
    );
  }
}

export function buildMemoryEmbeddingText(memory: EmbeddableMemory) {
  const categories = memory.categories
    .map((category) => category.name || category.key)
    .join(", ");

  return [
    `Title: ${memory.title}`,
    `Kind: ${memory.kind}`,
    categories ? `Categories: ${categories}` : null,
    `Sensitivity: ${memory.sensitivity}`,
    `Body: ${memory.body}`
  ]
    .filter(Boolean)
    .join("\n");
}

/** @internal */
function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function toVectorLiteral(vector: number[]) {
  return `[${vector.map((value) => Number(value).toString()).join(",")}]`;
}
