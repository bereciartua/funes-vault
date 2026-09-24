import {
  type Memory,
  type MemoryCategory,
  MemoryStatus,
  type Prisma,
  ReviewState
} from "@funes-vault/db";
import { Injectable, Logger } from "@nestjs/common";

import { errorMessage } from "../common/errors.js";
import { extractTerms } from "../common/text.js";
import {
  type EmbeddingsProvider,
  InjectEmbeddingsProvider
} from "../embeddings/embeddings.provider.js";
import {
  buildMemoryEmbeddingText,
  toVectorLiteral
} from "../embeddings/embeddings.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type RetrievedMemory = Memory & {
  categories: Pick<MemoryCategory, "key" | "name">[];
  relevanceScore: number;
};

type SemanticResult = {
  memoryId: string;
  score: number;
};

type KeywordResult = {
  id: string;
  score: number;
  exactMatch: boolean;
};

export const retrievalInclude = {
  categories: {
    select: { key: true, name: true },
    orderBy: { name: "asc" }
  }
} satisfies Prisma.MemoryInclude;

const keywordWeight = 0.45;
const semanticWeight = 0.55;
const exactKeywordBoost = 0.45;

/**
 * Owns owner-scoped keyword and vector candidate retrieval.
 * Tenant boundary: queries require userId; policy evaluation remains mandatory before disclosure.
 * Audit: read-only retrieval; callers audit any resulting disclosure.
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectEmbeddingsProvider()
    private readonly embeddingsProvider: EmbeddingsProvider
  ) {}

  async retrieve(input: {
    userId: string;
    task: string;
    requestedCategories: string[];
    limit?: number;
  }): Promise<RetrievedMemory[]> {
    const limit = input.limit ?? 30;
    const [keywordResults, semanticResults] = await Promise.all([
      this.keywordRetrieve(input, limit),
      this.semanticRetrieve(input, limit)
    ]);

    const scores = new Map<string, number>();

    for (const result of keywordResults) {
      const keywordScore =
        result.score * keywordWeight +
        (result.exactMatch ? exactKeywordBoost : 0);
      scores.set(result.id, (scores.get(result.id) ?? 0) + keywordScore);
    }

    for (const result of semanticResults) {
      scores.set(
        result.memoryId,
        (scores.get(result.memoryId) ?? 0) + result.score * semanticWeight
      );
    }

    const ids = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    if (ids.length === 0) {
      return [];
    }

    const memories = await this.prisma.client.memory.findMany({
      where: { id: { in: ids }, userId: input.userId },
      include: retrievalInclude
    });
    const byId = new Map(memories.map((memory) => [memory.id, memory]));

    return ids
      .map((id) => {
        const memory = byId.get(id);

        if (!memory) {
          return null;
        }

        return {
          ...memory,
          relevanceScore: scores.get(id) ?? 0
        };
      })
      .filter((memory): memory is RetrievedMemory => memory !== null);
  }

  private async keywordRetrieve(
    input: {
      userId: string;
      task: string;
      requestedCategories: string[];
    },
    limit: number
  ): Promise<KeywordResult[]> {
    const terms = extractTerms(input.task, 12);
    const where: Prisma.MemoryWhereInput = {
      userId: input.userId,
      status: MemoryStatus.ACTIVE,
      reviewState: ReviewState.APPROVED,
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }]
    };

    if (input.requestedCategories.length > 0) {
      where.categories = {
        some: {
          key: { in: input.requestedCategories }
        }
      };
    }

    if (terms.length > 0) {
      where.OR = terms.flatMap((term) => [
        { title: { contains: term, mode: "insensitive" } },
        { body: { contains: term, mode: "insensitive" } }
      ]);
    }

    const memories = await this.prisma.client.memory.findMany({
      where,
      include: retrievalInclude,
      orderBy: { updatedAt: "desc" },
      take: Math.max(limit, 50)
    });

    return memories
      .map((memory) => ({
        id: memory.id,
        score: scoreKeywordMemory(memory, terms),
        exactMatch: terms.length > 0
      }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async semanticRetrieve(
    input: {
      userId: string;
      task: string;
      requestedCategories: string[];
    },
    limit: number
  ): Promise<SemanticResult[]> {
    try {
      const generated = await this.embeddingsProvider.generate(input.task);
      const vector = toVectorLiteral(generated.vector);

      if (input.requestedCategories.length > 0) {
        return await this.prisma.client.$queryRawUnsafe<SemanticResult[]>(
          `
            SELECT m.id AS "memoryId", GREATEST(0, 1 - (e.vector <=> $2::vector))::float AS score
            FROM "Embedding" e
            JOIN "Memory" m ON m.id = e."memoryId"
            WHERE e."userId" = $1
              AND e.provider = $3
              AND EXISTS (
              SELECT 1
              FROM "_MemoryCategories" mc
              JOIN "MemoryCategory" c ON c.id = mc."B"
              WHERE mc."A" = m.id AND c.key = ANY($4::text[])
              )
              AND e.model = $5
              AND m.status = 'ACTIVE'
              AND m."reviewState" = 'APPROVED'
              AND (m."expiresAt" IS NULL OR m."expiresAt" > NOW())
            ORDER BY e.vector <=> $2::vector
            LIMIT $6
          `,
          input.userId,
          vector,
          generated.provider,
          input.requestedCategories,
          generated.model,
          limit
        );
      }

      return await this.prisma.client.$queryRawUnsafe<SemanticResult[]>(
        `
          SELECT m.id AS "memoryId", GREATEST(0, 1 - (e.vector <=> $2::vector))::float AS score
          FROM "Embedding" e
          JOIN "Memory" m ON m.id = e."memoryId"
          WHERE e."userId" = $1
            AND e.provider = $3
            AND e.model = $4
            AND m.status = 'ACTIVE'
            AND m."reviewState" = 'APPROVED'
            AND (m."expiresAt" IS NULL OR m."expiresAt" > NOW())
          ORDER BY e.vector <=> $2::vector
          LIMIT $5
        `,
        input.userId,
        vector,
        generated.provider,
        generated.model,
        limit
      );
    } catch (error) {
      const message = errorMessage(error, "unknown error");
      this.logger.warn(`Semantic retrieval unavailable: ${message}`);

      return [];
    }
  }
}

function scoreKeywordMemory(
  memory: Memory & { categories: Pick<MemoryCategory, "key" | "name">[] },
  terms: string[]
) {
  if (terms.length === 0) {
    return 0.1;
  }

  const text = buildMemoryEmbeddingText(memory).toLowerCase();
  const matches = terms.filter((term) => text.includes(term)).length;

  return matches / terms.length;
}
