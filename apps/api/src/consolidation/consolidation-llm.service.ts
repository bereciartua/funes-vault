import { ReviewState } from "@funes-vault/db";
import { MemoryStatus } from "@funes-vault/db";
import { isAtMostSensitivity } from "@funes-vault/shared/domain";
import { Injectable } from "@nestjs/common";

import { detectSecretLikeContent } from "../common/secret-like-content.js";
import type { MemoryWithCategories } from "../memories/memory.types.js";
import {
  MemoryProcessingConfigService,
  type ProcessingConfiguration
} from "../memory-processing/memory-processing-config.service.js";
import {
  ProcessingBlocked,
  ProcessingPermissionService
} from "../memory-processing/processing-permission.service.js";
import { sanitizedFailure } from "../memory-processing/validation.js";
import {
  JevMemoryConsolidationProvider,
  LlmMemoryConsolidationProvider
} from "./consolidation.providers.js";
import {
  type ArchiveCandidate,
  maxLlmPairs,
  toLlmMemory
} from "./consolidation.types.js";
import { ConsolidationCandidatesService } from "./consolidation-candidates.service.js";

/**
 * Evaluates candidate pairs using the configured consolidation provider and validates its
 * bounded output. The orchestrator supplies authorized memories and processor permission. This
 * service performs no database or audit writes.
 */
@Injectable()
export class ConsolidationLlmService {
  constructor(
    private readonly candidates: ConsolidationCandidatesService,
    private readonly config: MemoryProcessingConfigService,
    private readonly llm: LlmMemoryConsolidationProvider,
    private readonly jev: JevMemoryConsolidationProvider,
    private readonly permission: ProcessingPermissionService
  ) {}

  get configuration() {
    return this.config.effective;
  }

  async judge(
    userId: string,
    memories: MemoryWithCategories[],
    snapshot?: ProcessingConfiguration
  ) {
    const startedAt = Date.now();
    const configuration = snapshot ?? this.config.effective;
    const task = configuration.consolidation;
    const result = {
      candidates: [] as ArchiveCandidate[],
      status: "completed",
      reason: null as string | null,
      skippedPairs: 0,
      skippedSources: 0,
      skippedSourceReasons: {} as Record<string, number>,
      deferredPairs: 0,
      latencyMs: 0,
      completedSourceIds: [] as string[],
      fingerprint: configuration.fingerprint,
      model: task.model,
      maxSensitivity: task.maxSensitivity,
      diagnostics: {} as Record<string, unknown>
    };
    try {
      if (!task.available) {
        throw new ProcessingBlocked("provider_not_configured");
      }
      await this.permission.check(userId, "consolidation", task.processors);
      const exclusionReason = (m: MemoryWithCategories) => {
        if (m.userId !== userId || m.status !== MemoryStatus.ACTIVE) {
          return "unavailable";
        }
        if (m.reviewState !== ReviewState.APPROVED) {
          return "not_approved";
        }
        if (m.expiresAt && m.expiresAt <= new Date()) {
          return "expired";
        }
        if (!isAtMostSensitivity(m.sensitivity, task.maxSensitivity)) {
          return "above_sensitivity_limit";
        }
        if (
          detectSecretLikeContent({ body: JSON.stringify(toLlmMemory(m)) })
            .length
        ) {
          return "secret_like_content";
        }

        return null;
      };
      const permitted = (m: MemoryWithCategories) =>
        exclusionReason(m) === null;
      for (const memory of memories) {
        const reason = exclusionReason(memory);
        if (reason) {
          result.skippedSources += 1;
          result.skippedSourceReasons[reason] =
            (result.skippedSourceReasons[reason] ?? 0) + 1;
        }
      }
      const pairs = await this.candidates.findRecentCandidatePairs(
        userId,
        memories,
        Number.MAX_SAFE_INTEGER
      );
      const eligible = pairs.filter(
        (p) => permitted(p.recentMemory) && permitted(p.candidateMemory)
      );
      const selected = eligible.slice(0, 1000);
      result.skippedPairs = pairs.length - selected.length;
      result.deferredPairs = eligible.length - selected.length;
      if (result.deferredPairs) {
        result.status = "partial";
        result.reason = "pair_limit_reached";
      }
      const signal = AbortSignal.timeout(task.timeoutMs);
      const input = {
        pairs: selected.map((p, i) => ({
          id: `pair_${i}`,
          left: toLlmMemory(p.recentMemory),
          right: toLlmMemory(p.candidateMemory),
          newer:
            p.recentMemory.updatedAt > p.candidateMemory.updatedAt
              ? ("left" as const)
              : p.recentMemory.updatedAt < p.candidateMemory.updatedAt
                ? ("right" as const)
                : ("same" as const)
        }))
      };
      const output = {
        decisions:
          [] as import("../memory-processing/contracts.js").ConsolidationResult["decisions"],
        diagnostics: {} as Record<string, unknown>
      };
      const judgedPairIds = new Set<string>();
      const deadline = Date.now() + task.timeoutMs;
      for (let offset = 0; offset < input.pairs.length; offset += maxLlmPairs) {
        const batch = {
          pairs: input.pairs.slice(offset, offset + maxLlmPairs)
        };
        try {
          signal.throwIfAborted();
          const judgment = await (
            task.system === "system_1" ? this.jev : this.llm
          ).judge(batch, {
            signal,
            deadline,
            correlationId: `consolidation-${userId}-${offset}`,
            configuration,
            beforeCall: (payload) =>
              this.permission.check(
                userId,
                "consolidation",
                task.processors,
                payload
              )
          });
          output.decisions.push(...judgment.decisions);
          output.diagnostics[String(offset)] = judgment.diagnostics;
          batch.pairs.forEach((pair) => judgedPairIds.add(pair.id));
        } catch (error) {
          result.status = judgedPairIds.size ? "partial" : "failed";
          result.reason =
            error instanceof ProcessingBlocked
              ? error.reason
              : sanitizedFailure(error);
          break;
        }
      }
      await this.permission.check(userId, "consolidation", task.processors);
      result.diagnostics = output.diagnostics;
      const targets = new Set<string>();
      const survivors = new Set<string>();
      const pairCounts = new Map<string, number>();
      for (const decision of output.decisions) {
        pairCounts.set(
          decision.pairId,
          (pairCounts.get(decision.pairId) ?? 0) + 1
        );
      }
      for (const decision of output.decisions) {
        const index = input.pairs.findIndex((p) => p.id === decision.pairId);
        const pair = selected[index];
        if (!pair || pairCounts.get(decision.pairId) !== 1) {
          continue;
        }
        const target =
          decision.archive === "left"
            ? pair.recentMemory
            : pair.candidateMemory;
        const survivor =
          decision.archive === "left"
            ? pair.candidateMemory
            : pair.recentMemory;
        if (
          target.id === survivor.id ||
          targets.has(target.id) ||
          targets.has(survivor.id) ||
          survivors.has(target.id)
        ) {
          continue;
        }
        targets.add(target.id);
        survivors.add(survivor.id);
        result.candidates.push({
          memory: target,
          canonicalMemory: survivor,
          reason:
            decision.reason === "duplicate"
              ? "semantic_duplicate"
              : decision.reason,
          confidence: decision.confidence,
          evidence: decision.evidence,
          processing: {
            pairId: decision.pairId,
            fingerprint: configuration.fingerprint,
            model: task.model,
            rubric: configuration.rubric,
            processors: task.processors
          }
        });
      }
      // Only fully inspected batches advance source versions. Excluded sources remain
      // discoverable if their eligibility changes; exclusions alone are not a failed run.
      result.completedSourceIds = memories
        .filter(
          (m) =>
            permitted(m) &&
            pairs
              .filter(
                (p) =>
                  p.recentMemory.id === m.id || p.candidateMemory.id === m.id
              )
              .every((p) => {
                const index = selected.indexOf(p);

                return index >= 0 && judgedPairIds.has(`pair_${index}`);
              })
        )
        .map((m) => m.id);
    } catch (error) {
      result.status = error instanceof ProcessingBlocked ? "skipped" : "failed";
      result.reason =
        error instanceof ProcessingBlocked
          ? error.reason
          : sanitizedFailure(error);
    }
    result.latencyMs = Date.now() - startedAt;

    return result;
  }
}
