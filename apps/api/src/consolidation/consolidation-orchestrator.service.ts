import { ConsolidationMode } from "@funes-vault/db";
import { JobType, MemoryStatus } from "@funes-vault/db";
import { Injectable } from "@nestjs/common";

import { lockUser } from "../common/db-locks.js";
import { getObjectMetadata, toJson } from "../common/serialization.js";
import type { ProcessingConfiguration } from "../memory-processing/memory-processing-config.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ConsolidationRepository } from "./consolidation.repository.js";
import {
  type ConsolidationActionSummary,
  recentConsolidationWindowHours,
  toConsolidationActionSummary
} from "./consolidation.types.js";
import { ConsolidationCandidatesService } from "./consolidation-candidates.service.js";
import { ConsolidationLlmService } from "./consolidation-llm.service.js";
import { ConsolidationWriterService } from "./consolidation-writer.service.js";
import { dedupeCandidates } from "./dedupe-candidates.js";

/**
 * Coordinates owner-scoped discovery, permission checks, provider judgments and consolidation
 * writes. Provider calls occur outside writer transactions; stored source versions are
 * revalidated when applying an action.
 */
@Injectable()
export class ConsolidationOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: ConsolidationCandidatesService,
    private readonly llm: ConsolidationLlmService,
    private readonly writer: ConsolidationWriterService,
    private readonly repository: ConsolidationRepository
  ) {}

  async runConsolidation(data: { userId: string; jobRunId: string }) {
    const runStartedAt = new Date();
    const recentCutoff = new Date(
      runStartedAt.getTime() - recentConsolidationWindowHours * 60 * 60 * 1000
    );
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: data.userId },
      select: {
        consolidationMode: true
      }
    });
    const job = await this.prisma.client.jobRun.findFirst({
      where: { id: data.jobRunId, userId: data.userId }
    });
    const previous = getObjectMetadata(job?.metadata);
    const originalSources = Array.isArray(previous.sourceVersions)
      ? (previous.sourceVersions as { id: string; version: string }[])
      : null;
    const [discoveredMemories, expiredMemories] = await Promise.all([
      this.candidates.findRecentConsolidationMemories(
        data.userId,
        recentCutoff
      ),
      this.candidates.findExpiredConsolidationMemories(
        data.userId,
        runStartedAt
      )
    ]);
    const recentMemories = originalSources
      ? (
          await this.candidates.findMemoriesByIds(
            data.userId,
            originalSources.map((s) => s.id)
          )
        ).filter(
          (m) =>
            m.status === MemoryStatus.ACTIVE &&
            originalSources.some(
              (s) => s.id === m.id && s.version === m.updatedAt.toISOString()
            )
        )
      : discoveredMemories;
    const sourceVersions =
      originalSources ??
      recentMemories.map((m) => ({
        id: m.id,
        version: m.updatedAt.toISOString()
      }));
    const configuration = (previous.configuration ??
      this.llm.configuration) as ProcessingConfiguration;
    await this.prisma.client.jobRun.update({
      where: { id: data.jobRunId },
      data: {
        metadata: toJson({ ...previous, sourceVersions, configuration })
      }
    });
    const semantic = await this.llm.judge(
      data.userId,
      recentMemories,
      configuration
    );
    if (originalSources && originalSources.length !== recentMemories.length) {
      semantic.status = "partial";
      semantic.reason = "source_versions_changed";
    }

    const candidates = [
      ...this.candidates.findExpiredCandidates(expiredMemories, runStartedAt),
      ...(await this.candidates.findDuplicateCandidates(
        data.userId,
        recentMemories
      )),
      ...semantic.candidates
    ];
    const dedupedCandidates = dedupeCandidates(candidates);

    const suggestions: string[] = [];
    const applied: string[] = [];
    const actions: ConsolidationActionSummary[] = [];
    const inspectedMemoryIds = new Set([
      ...recentMemories.map((memory) => memory.id),
      ...expiredMemories.map((memory) => memory.id),
      ...dedupedCandidates.map((candidate) => candidate.memory.id)
    ]);
    const queuedArchiveSuggestionTargetIds =
      user.consolidationMode === ConsolidationMode.REVIEW_ONLY ||
      configuration.consolidation.applyMode === "review"
        ? await this.candidates.findQueuedArchiveSuggestionTargetIds(
            data.userId
          )
        : new Set<string>();

    for (const candidate of dedupedCandidates) {
      if (
        user.consolidationMode === ConsolidationMode.AUTO_APPLY &&
        !(
          candidate.processing &&
          configuration.consolidation.applyMode === "review"
        )
      ) {
        const archived = await this.writer.archiveCandidate(
          data.userId,
          data.jobRunId,
          candidate,
          user.consolidationMode
        );
        if (archived.archived) {
          applied.push(candidate.memory.id);
          actions.push(
            toConsolidationActionSummary(candidate, {
              mode: user.consolidationMode,
              applied: true,
              suggestionId: null,
              auditEventId: archived.auditEventId
            })
          );
        }
      } else {
        const suggestion = await this.writer.createArchiveSuggestion(
          data.userId,
          data.jobRunId,
          candidate,
          user.consolidationMode,
          queuedArchiveSuggestionTargetIds
        );
        if (suggestion) {
          suggestions.push(suggestion.id);
          queuedArchiveSuggestionTargetIds.add(candidate.memory.id);
          actions.push(
            toConsolidationActionSummary(candidate, {
              mode: user.consolidationMode,
              applied: false,
              suggestionId: suggestion.id,
              auditEventId: null
            })
          );
        }
      }
    }

    await this.repository.markMemoriesConsolidated(
      data.userId,
      [...inspectedMemoryIds],
      runStartedAt
    );

    await this.prisma.client.$transaction(async (tx) => {
      await lockUser(tx, data.userId);
      if (configuration.consolidation.processors.includes("typesafe")) {
        const consent = await tx.processingConsent.findUnique({
          where: {
            userId_processor_scope: {
              userId: data.userId,
              processor: "typesafe",
              scope: "consolidation"
            }
          }
        });
        if (!consent || consent.revokedAt || consent.version !== 1) {
          semantic.status = "partial";
          semantic.reason = "processing_consent_required";

          return;
        }
      }
      for (const memory of recentMemories.filter((m) =>
        semantic.completedSourceIds.includes(m.id)
      )) {
        await tx.$executeRaw`UPDATE "Memory" SET "semanticInspectedAt" = ${runStartedAt} WHERE id = ${memory.id} AND "userId" = ${data.userId} AND "consolidationRelevantAt" = ${memory.consolidationRelevantAt}`;
      }
    });

    return {
      configuration,
      sourceVersions,
      semantic: {
        status: semantic.status,
        reason: semantic.reason,
        skippedPairs: semantic.skippedPairs,
        skippedSources: semantic.skippedSources,
        skippedSourceReasons: semantic.skippedSourceReasons,
        deferredPairs: semantic.deferredPairs,
        latencyMs: semantic.latencyMs,
        fingerprint: semantic.fingerprint,
        model: semantic.model,
        maxSensitivity: semantic.maxSensitivity,
        diagnostics: semantic.diagnostics
      },
      jobRunId: data.jobRunId,
      type: JobType.CONSOLIDATE_MEMORIES,
      mode: user.consolidationMode,
      recentWindowHours: recentConsolidationWindowHours,
      inspectedMemories: inspectedMemoryIds.size,
      recentMemoryCount: recentMemories.length,
      expiredMemoryCount: expiredMemories.length,
      candidateCount: dedupedCandidates.length,
      suggestionIds: suggestions,
      appliedMemoryIds: applied,
      actionCounts: {
        suggestionsCreated: suggestions.length,
        actionsAutoApplied: applied.length,
        noActionPairs: Math.max(
          0,
          inspectedMemoryIds.size - dedupedCandidates.length
        )
      },
      actions
    };
  }
}
