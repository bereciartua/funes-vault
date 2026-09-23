import { ConsolidationMode } from "@funes-vault/db";
import { type JobRun as DbJobRun, JobType } from "@funes-vault/db";

import { getObjectMetadata, toIsoString } from "../common/serialization.js";
export function toJobRunResponse(job: DbJobRun) {
  const metadata = getObjectMetadata(job.metadata);

  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    metadata,
    consolidation:
      job.type === JobType.CONSOLIDATE_MEMORIES
        ? consolidationDetailsFromMetadata(metadata)
        : null,
    error: job.error,
    startedAt: toIsoString(job.startedAt),
    finishedAt: toIsoString(job.finishedAt),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

function consolidationDetailsFromMetadata(metadata: Record<string, unknown>) {
  const actions = Array.isArray(metadata.actions)
    ? metadata.actions.filter(
        (action): action is Record<string, unknown> =>
          typeof action === "object" &&
          action !== null &&
          !Array.isArray(action)
      )
    : [];

  return {
    trigger: typeof metadata.trigger === "string" ? metadata.trigger : "manual",
    mode:
      metadata.mode === ConsolidationMode.AUTO_APPLY ||
      metadata.mode === ConsolidationMode.REVIEW_ONLY
        ? metadata.mode
        : ConsolidationMode.REVIEW_ONLY,
    inspectedMemoryCount:
      typeof metadata.inspectedMemories === "number"
        ? metadata.inspectedMemories
        : 0,
    recentMemoryCount:
      typeof metadata.recentMemoryCount === "number"
        ? metadata.recentMemoryCount
        : 0,
    expiredMemoryCount:
      typeof metadata.expiredMemoryCount === "number"
        ? metadata.expiredMemoryCount
        : 0,
    candidateCount:
      typeof metadata.candidateCount === "number" ? metadata.candidateCount : 0,
    suggestionsCreated:
      typeof getObjectMetadata(metadata.actionCounts).suggestionsCreated ===
      "number"
        ? (getObjectMetadata(metadata.actionCounts)
            .suggestionsCreated as number)
        : Array.isArray(metadata.suggestionIds)
          ? metadata.suggestionIds.length
          : 0,
    actionsAutoApplied:
      typeof getObjectMetadata(metadata.actionCounts).actionsAutoApplied ===
      "number"
        ? (getObjectMetadata(metadata.actionCounts)
            .actionsAutoApplied as number)
        : Array.isArray(metadata.appliedMemoryIds)
          ? metadata.appliedMemoryIds.length
          : 0,
    noActionPairs:
      typeof getObjectMetadata(metadata.actionCounts).noActionPairs === "number"
        ? (getObjectMetadata(metadata.actionCounts).noActionPairs as number)
        : 0,
    actions
  };
}

// Queue lifecycle and the user-facing jobs API. Consolidation execution
// lives in ConsolidationJobService; candidate discovery in
// ConsolidationCandidatesService.
