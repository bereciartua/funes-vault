import {
  MemoryStatus,
  MemorySuggestionStatus,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import { Injectable, Logger } from "@nestjs/common";

import { errorMessage } from "../common/errors.js";
import { getObjectMetadata } from "../common/serialization.js";
import { extractTerms } from "../common/text.js";
import {
  memoryInclude,
  type MemoryWithCategories
} from "../memories/memory.types.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ConsolidationRepository } from "./consolidation.repository.js";
import {
  type ArchiveCandidate,
  type ConsolidationPair,
  lexicalCandidateLimit,
  lexicalSimilarity,
  minimumLexicalScore,
  minimumSemanticScore,
  normalizeForDuplicate,
  pairKey
} from "./consolidation.types.js";

/**
 * Reads owner-scoped expired, duplicate and recent memories, then ranks bounded semantic or
 * lexical pairs. It discovers candidates only; it does not apply changes or write audits.
 */
@Injectable()
export class ConsolidationCandidatesService {
  private readonly logger = new Logger(ConsolidationCandidatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ConsolidationRepository
  ) {}

  async findRecentConsolidationMemories(userId: string, cutoff: Date) {
    const rows = await this.repository.findRecentIds(userId, cutoff);

    return this.findMemoriesByIds(
      userId,
      rows.map((row) => row.id)
    );
  }

  async findExpiredConsolidationMemories(userId: string, now: Date) {
    const rows = await this.repository.findExpiredIds(userId, now);

    return this.findMemoriesByIds(
      userId,
      rows.map((row) => row.id)
    );
  }

  async findMemoriesByIds(userId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];

    if (uniqueIds.length === 0) {
      return [];
    }

    const memories = await this.prisma.client.memory.findMany({
      where: {
        id: { in: uniqueIds },
        userId
      },
      include: memoryInclude
    });
    const byId = new Map(memories.map((memory) => [memory.id, memory]));

    return uniqueIds
      .map((id) => byId.get(id))
      .filter((memory): memory is MemoryWithCategories => Boolean(memory));
  }

  findExpiredCandidates(
    memories: MemoryWithCategories[],
    now: Date
  ): ArchiveCandidate[] {
    return memories
      .filter((memory) => memory.expiresAt && memory.expiresAt <= now)
      .map((memory) => ({
        memory,
        reason: "expired" as const,
        evidence: `Expired on ${memory.expiresAt?.toISOString()}.`
      }));
  }

  async findDuplicateCandidates(
    userId: string,
    recentMemories: MemoryWithCategories[]
  ) {
    const candidates: ArchiveCandidate[] = [];
    const seenCandidateIds = new Set<string>();

    for (const recentMemory of recentMemories) {
      const duplicateRows = await this.repository.findDuplicateIds(
        userId,
        recentMemory
      );
      const duplicateMemories = await this.findMemoriesByIds(
        userId,
        duplicateRows.map((row) => row.id)
      );
      const group = [recentMemory, ...duplicateMemories].filter(
        (memory) =>
          normalizeForDuplicate(`${memory.title}\n${memory.body}`) ===
          normalizeForDuplicate(`${recentMemory.title}\n${recentMemory.body}`)
      );

      if (group.length < 2) {
        continue;
      }

      const [canonical, ...duplicates] = [...group].sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
      );

      if (!canonical) {
        continue;
      }

      for (const duplicate of duplicates) {
        if (seenCandidateIds.has(duplicate.id)) {
          continue;
        }

        candidates.push({
          memory: duplicate,
          canonicalMemory: canonical,
          reason: "exact_duplicate",
          evidence: `Exact duplicate of memory ${canonical.id}.`
        });
        seenCandidateIds.add(duplicate.id);
      }
    }

    return candidates;
  }

  async findRecentCandidatePairs(
    userId: string,
    recentMemories: MemoryWithCategories[],
    pairLimit: number
  ) {
    const pairs = new Map<string, ConsolidationPair>();

    for (const memory of recentMemories) {
      for (const pair of await this.findLexicalPairs(userId, memory)) {
        pairs.set(pairKey(pair.recentMemory.id, pair.candidateMemory.id), pair);
      }

      for (const pair of await this.findSemanticPairs(userId, memory)) {
        const key = pairKey(pair.recentMemory.id, pair.candidateMemory.id);
        const existing = pairs.get(key);
        pairs.set(
          key,
          existing && existing.score >= pair.score ? existing : pair
        );
      }
    }

    return [...pairs.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, pairLimit);
  }

  async findQueuedArchiveSuggestionTargetIds(userId: string) {
    const suggestions = await this.prisma.client.memorySuggestion.findMany({
      where: {
        userId,
        status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
        sourceType: SourceType.CONSOLIDATION
      },
      select: {
        sourceMetadata: true
      }
    });
    const targetIds = new Set<string>();

    for (const suggestion of suggestions) {
      const metadata = getObjectMetadata(suggestion.sourceMetadata);

      if (
        metadata.action === "archive_memory" &&
        typeof metadata.targetMemoryId === "string"
      ) {
        targetIds.add(metadata.targetMemoryId);
      }
    }

    return targetIds;
  }

  private async findLexicalPairs(
    userId: string,
    recentMemory: MemoryWithCategories
  ) {
    const terms = [
      ...extractTerms(`${recentMemory.title} ${recentMemory.body}`)
    ]
      .sort((left, right) => right.length - left.length)
      .slice(0, 8);

    if (terms.length === 0) {
      return [];
    }

    const candidates = await this.prisma.client.memory.findMany({
      where: {
        userId,
        status: MemoryStatus.ACTIVE,
        reviewState: ReviewState.APPROVED,
        id: { not: recentMemory.id },
        OR: terms.flatMap((term) => [
          { title: { contains: term, mode: "insensitive" as const } },
          { body: { contains: term, mode: "insensitive" as const } }
        ])
      },
      include: memoryInclude,
      orderBy: { consolidationRelevantAt: "desc" },
      take: lexicalCandidateLimit
    });

    return candidates
      .filter((candidate) => candidate.id !== recentMemory.id)
      .map((candidate) => ({
        recentMemory,
        candidateMemory: candidate,
        score: lexicalSimilarity(recentMemory, candidate),
        source: "lexical" as const
      }))
      .filter((pair) => pair.score >= minimumLexicalScore);
  }

  private async findSemanticPairs(
    userId: string,
    recentMemory: MemoryWithCategories
  ) {
    try {
      const results = await this.repository.findSemanticResults(
        userId,
        recentMemory
      );
      const candidateMemories = await this.findMemoriesByIds(
        userId,
        results.map((result) => result.memoryId)
      );
      const memoryById = new Map(
        candidateMemories.map((memory) => [memory.id, memory])
      );

      const pairs: ConsolidationPair[] = [];

      for (const result of results) {
        if (result.score < minimumSemanticScore) {
          continue;
        }

        const candidateMemory = memoryById.get(result.memoryId);

        if (!candidateMemory) {
          continue;
        }

        pairs.push({
          recentMemory,
          candidateMemory,
          score: result.score,
          source: "semantic" as const
        });
      }

      return pairs;
    } catch (error) {
      const message = errorMessage(error, "unknown error");
      this.logger.warn(`Semantic consolidation search unavailable: ${message}`);

      return [];
    }
  }
}
