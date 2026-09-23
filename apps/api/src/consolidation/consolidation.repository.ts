import { Prisma } from "@funes-vault/db";
import { Injectable } from "@nestjs/common";

import { type MemoryWithCategories } from "../memories/memory.types.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  exactDuplicateCandidateLimit,
  type MemoryIdRow,
  normalizeForDuplicate,
  semanticCandidateLimit,
  type SemanticResult
} from "./consolidation.types.js";
/** Reads owner-scoped active candidates and vector neighbors. No mutations or disclosure auditing; callers validate candidates before applying results. */
@Injectable()
export class ConsolidationRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findRecentIds(userId: string, cutoff: Date) {
    return this.prisma.client.$queryRawUnsafe<MemoryIdRow[]>(
      `
        SELECT id
        FROM "Memory"
        WHERE "userId" = $1
          AND status = 'ACTIVE'::"MemoryStatus"
          AND (
            ("consolidationRelevantAt" >= $2 AND ("lastConsolidatedAt" IS NULL OR "lastConsolidatedAt" < "consolidationRelevantAt"))
            OR "semanticInspectedAt" IS NULL OR "semanticInspectedAt" < "consolidationRelevantAt"
          )
        ORDER BY "consolidationRelevantAt" DESC, id ASC
      `,
      userId,
      cutoff
    );
  }

  async findExpiredIds(userId: string, now: Date) {
    return this.prisma.client.$queryRawUnsafe<MemoryIdRow[]>(
      `
        SELECT id
        FROM "Memory"
        WHERE "userId" = $1
          AND status = 'ACTIVE'::"MemoryStatus"
          AND "expiresAt" IS NOT NULL
          AND "expiresAt" <= $2
          AND (
            "lastConsolidatedAt" IS NULL
            OR "lastConsolidatedAt" < "expiresAt"
          )
        ORDER BY "expiresAt" ASC, id ASC
      `,
      userId,
      now
    );
  }

  async findDuplicateIds(userId: string, recentMemory: MemoryWithCategories) {
    return this.prisma.client.$queryRawUnsafe<MemoryIdRow[]>(
      `
          SELECT id
          FROM "Memory"
          WHERE "userId" = $1
            AND status = 'ACTIVE'::"MemoryStatus"
            AND id <> $2
            AND LOWER(regexp_replace(TRIM(title || E'\n' || body), '[[:space:]]+', ' ', 'g')) = $3
          ORDER BY "updatedAt" DESC, id ASC
          LIMIT $4
        `,
      userId,
      recentMemory.id,
      normalizeForDuplicate(`${recentMemory.title}\n${recentMemory.body}`),
      exactDuplicateCandidateLimit
    );
  }

  async findSemanticResults(
    userId: string,
    recentMemory: MemoryWithCategories
  ) {
    return this.prisma.client.$queryRawUnsafe<SemanticResult[]>(
      `
          WITH source AS (
            SELECT e.vector, e.provider, e.model
            FROM "Embedding" e
            WHERE e."userId" = $1
              AND e."memoryId" = $2
            ORDER BY e."updatedAt" DESC
            LIMIT 1
          ),
          candidate_embeddings AS (
            SELECT DISTINCT ON (e."memoryId") e."memoryId", e.vector
            FROM "Embedding" e
            JOIN source ON source.provider = e.provider
              AND source.model = e.model
            JOIN "Memory" m ON m.id = e."memoryId"
            WHERE e."userId" = $1
              AND e."memoryId" <> $2
              AND m.status = 'ACTIVE'
              AND m."reviewState" = 'APPROVED'
            ORDER BY e."memoryId", e."updatedAt" DESC
          )
          SELECT m.id AS "memoryId",
            GREATEST(0, 1 - (candidate_embeddings.vector <=> source.vector))::float AS score
          FROM candidate_embeddings
          JOIN source ON true
          JOIN "Memory" m ON m.id = candidate_embeddings."memoryId"
          ORDER BY candidate_embeddings.vector <=> source.vector
          LIMIT $3
        `,
      userId,
      recentMemory.id,
      semanticCandidateLimit
    );
  }

  async markMemoriesConsolidated(
    userId: string,
    memoryIds: string[],
    consolidatedAt: Date
  ) {
    const ids = [...new Set(memoryIds)];
    if (!ids.length) {
      return;
    }
    // Preserve content updatedAt: bookkeeping must not invalidate a saved source revision.
    await this.prisma.client.$executeRaw(
      Prisma.sql`UPDATE "Memory" SET "lastConsolidatedAt" = ${consolidatedAt} WHERE "userId" = ${userId} AND id IN (${Prisma.join(ids)})`
    );
  }
}
