import {
  MemorySensitivity,
  MemoryStatus,
  type Prisma,
  ReviewState
} from "@funes-vault/db";
import {
  EMBEDDING_DIMENSIONS,
  type ListMemoriesQuery
} from "@funes-vault/shared";
import { Injectable, Logger } from "@nestjs/common";

import { errorMessage } from "../common/errors.js";
import { buildPagination, paginationSkip } from "../common/pagination.js";
import { detectSecretLikeContent } from "../common/secret-like-content.js";
import {
  type EmbeddingsProvider,
  InjectEmbeddingsProvider,
  shouldEmbedSensitivity
} from "../embeddings/embeddings.provider.js";
import { toVectorLiteral } from "../embeddings/embeddings.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toMemoryResponse } from "./memory.mapper.js";
import { memoryInclude, type MemoryWithCategories } from "./memory.types.js";
type SemanticSearchInput = {
  provider: string;
  model: string;
  vector: string;
  allowedSensitivities: MemorySensitivity[];
};
type SemanticSearchRow = {
  memoryId: string;
};
type SemanticSearchCountRow = {
  total: number | bigint | string;
};
const vaultSemanticSimilarityThreshold = 0.3;
/** Builds owner-scoped filtered memory queries for the owner UI. It does not authorize third-party disclosure or write audit events. */
@Injectable()
export class MemorySearchRepository {
  private readonly logger = new Logger(MemorySearchRepository.name);
  constructor(
    private readonly prisma: PrismaService,
    @InjectEmbeddingsProvider()
    private readonly embeddingsProvider: EmbeddingsProvider
  ) {}

  async listMemories(userId: string, query: ListMemoriesQuery) {
    if (query.query) {
      const semanticSearch = await this.prepareSemanticSearch(query);

      if (semanticSearch) {
        try {
          return await this.listSemanticSearchMemories(
            userId,
            query,
            semanticSearch
          );
        } catch (error) {
          const message = errorMessage(error, "unknown error");
          this.logger.warn(
            `Semantic memory list search unavailable: ${message}`
          );
        }
      }
    }

    return this.listKeywordMemories(userId, query);
  }

  private async listKeywordMemories(userId: string, query: ListMemoriesQuery) {
    const where = this.buildListWhere(userId, query);
    const orderBy = {
      [query.sort]: query.direction
    } as Prisma.MemoryOrderByWithRelationInput;

    const total = await this.prisma.client.memory.count({ where });
    const pagination = buildPagination(query, total);
    const items =
      total === 0
        ? []
        : await this.prisma.client.memory.findMany({
            where,
            include: memoryInclude,
            orderBy,
            skip: paginationSkip(pagination),
            take: pagination.limit
          });

    return {
      items: items.map(toMemoryResponse),
      pagination
    };
  }

  private async listSemanticSearchMemories(
    userId: string,
    query: ListMemoriesQuery,
    semanticSearch: SemanticSearchInput
  ) {
    const sql = this.buildSemanticSearchSql(userId, query, semanticSearch);
    const countRows = await this.prisma.client.$queryRawUnsafe<
      SemanticSearchCountRow[]
    >(
      `${sql.cte}
        SELECT COUNT(*)::int AS total
        FROM matched
        `,
      ...sql.params
    );
    const total = Number(countRows[0]?.total ?? 0);
    const pagination = buildPagination(query, total);

    if (total === 0) {
      return {
        items: [],
        pagination
      };
    }

    const sortExpression = this.semanticSearchSortExpression(query.sort);
    const direction = query.direction === "asc" ? "ASC" : "DESC";
    const offsetParam = `$${sql.params.length + 1}`;
    const limitParam = `$${sql.params.length + 2}`;
    const rows = await this.prisma.client.$queryRawUnsafe<SemanticSearchRow[]>(
      `${sql.cte}
      SELECT "memoryId"
      FROM matched
      ORDER BY "searchScore" DESC,
        ${sortExpression} ${direction},
        "memoryId" ASC
      OFFSET ${offsetParam}
      LIMIT ${limitParam}
      `,
      ...sql.params,
      paginationSkip(pagination),
      pagination.limit
    );
    const ids = rows.map((row) => row.memoryId);

    if (ids.length === 0) {
      return {
        items: [],
        pagination
      };
    }

    const memories = await this.prisma.client.memory.findMany({
      where: { id: { in: ids }, userId },
      include: memoryInclude
    });
    const byId = new Map(memories.map((memory) => [memory.id, memory]));

    return {
      items: ids
        .map((id) => byId.get(id))
        .filter((memory): memory is MemoryWithCategories => Boolean(memory))
        .map(toMemoryResponse),
      pagination
    };
  }

  private async prepareSemanticSearch(query: ListMemoriesQuery) {
    if (!query.query || !this.shouldAttemptSemanticSearch(query)) {
      return null;
    }

    if (!this.embeddingsProvider) {
      return null;
    }

    try {
      const generated = await this.embeddingsProvider.generate(query.query);

      if (generated.vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Expected ${EMBEDDING_DIMENSIONS} query embedding dimensions, got ${generated.vector.length}`
        );
      }

      return {
        provider: generated.provider,
        model: generated.model,
        vector: toVectorLiteral(generated.vector),
        allowedSensitivities: Object.values(MemorySensitivity).filter(
          shouldEmbedSensitivity
        )
      };
    } catch (error) {
      const message = errorMessage(error, "unknown error");
      this.logger.warn(`Semantic memory list search unavailable: ${message}`);

      return null;
    }
  }

  private shouldAttemptSemanticSearch(query: ListMemoriesQuery) {
    if (!query.query) {
      return false;
    }

    if (detectSecretLikeContent({ body: query.query }).length > 0) {
      return false;
    }

    if (query.status && query.status !== MemoryStatus.ACTIVE) {
      return false;
    }

    if (query.reviewState && query.reviewState !== ReviewState.APPROVED) {
      return false;
    }

    if (query.sensitivity && !shouldEmbedSensitivity(query.sensitivity)) {
      return false;
    }

    return true;
  }

  private buildSemanticSearchSql(
    userId: string,
    query: ListMemoriesQuery,
    semanticSearch: SemanticSearchInput
  ) {
    const params: unknown[] = [
      userId,
      query.query ?? "",
      semanticSearch.vector,
      semanticSearch.provider,
      semanticSearch.model,
      vaultSemanticSimilarityThreshold,
      semanticSearch.allowedSensitivities
    ];
    const conditions = [`m."userId" = $1`];
    const addParam = (value: unknown) => {
      params.push(value);

      return `$${params.length}`;
    };

    if (query.status) {
      conditions.push(`m.status = ${addParam(query.status)}::"MemoryStatus"`);
    } else {
      conditions.push(`m.status <> 'DELETED'::"MemoryStatus"`);
    }

    if (query.categoryKeys?.length) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM "_MemoryCategories" mc
          JOIN "MemoryCategory" c ON c.id = mc."B"
          WHERE mc."A" = m.id AND c.key = ANY(${addParam(query.categoryKeys)}::text[])
        )
      `);
    }

    if (query.sensitivity) {
      conditions.push(
        `m.sensitivity = ${addParam(query.sensitivity)}::"MemorySensitivity"`
      );
    }

    if (query.reviewState) {
      conditions.push(
        `m."reviewState" = ${addParam(query.reviewState)}::"ReviewState"`
      );
    }

    const keywordExpression = `
      (
        POSITION(LOWER($2::text) IN LOWER(m.title)) > 0
        OR POSITION(LOWER($2::text) IN LOWER(m.body)) > 0
      )
    `;

    return {
      params,
      cte: `
        WITH ranked AS (
          SELECT
            m.id AS "memoryId",
            CASE WHEN ${keywordExpression} THEN 1 ELSE 0 END::float AS "keywordScore",
            COALESCE(GREATEST(0, 1 - (e.vector <=> $3::vector)), 0)::float AS "semanticScore",
            m."createdAt",
            m."updatedAt",
            m.title,
            m.confidence
          FROM "Memory" m
          LEFT JOIN LATERAL (
            SELECT e.vector
            FROM "Embedding" e
            WHERE e."memoryId" = m.id
              AND e."userId" = m."userId"
              AND e.provider = $4
              AND e.model = $5
              AND m.status = 'ACTIVE'::"MemoryStatus"
              AND m."reviewState" = 'APPROVED'::"ReviewState"
              AND m.sensitivity = ANY($7::"MemorySensitivity"[])
            ORDER BY e."updatedAt" DESC
            LIMIT 1
          ) e ON true
          WHERE ${conditions.join(" AND ")}
        ),
        matched AS (
          SELECT
            "memoryId",
            "createdAt",
            "updatedAt",
            title,
            confidence,
            ("keywordScore" * 0.45 + "semanticScore" * 0.55) AS "searchScore"
          FROM ranked
          WHERE "keywordScore" > 0 OR "semanticScore" >= $6
        )
      `
    };
  }

  private semanticSearchSortExpression(sort: ListMemoriesQuery["sort"]) {
    const sortExpressions = {
      createdAt: `"createdAt"`,
      updatedAt: `"updatedAt"`,
      title: `LOWER(title)`,
      confidence: `confidence`
    } satisfies Record<ListMemoriesQuery["sort"], string>;

    return sortExpressions[sort];
  }

  private buildListWhere(userId: string, query: ListMemoriesQuery) {
    const where: Prisma.MemoryWhereInput = {
      userId,
      status: query.status ?? { not: MemoryStatus.DELETED }
    };

    if (query.query) {
      where.OR = [
        { title: { contains: query.query, mode: "insensitive" } },
        { body: { contains: query.query, mode: "insensitive" } }
      ];
    }

    if (query.categoryKeys?.length) {
      where.categories = {
        some: {
          key: { in: query.categoryKeys }
        }
      };
    }

    if (query.sensitivity) {
      where.sensitivity = query.sensitivity;
    }

    if (query.reviewState) {
      where.reviewState = query.reviewState;
    }

    return where;
  }
}
