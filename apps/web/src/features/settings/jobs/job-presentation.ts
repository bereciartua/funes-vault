import {
  consolidationSemanticMetadataSchema,
  type JobRun
} from "@funes-vault/shared";

import { jobTypeLabel } from "../../../lib/domain/labels";
import { pluralize } from "../../../lib/text";
import type { FeedTone } from "../settings-scaffolding";
export function jobRunSentence(job: JobRun) {
  const type = jobTypeLabel(job.type);
  if (job.status === "SUCCEEDED") {
    const semantic = consolidationSemanticMetadataSchema.safeParse(
      job.metadata.semantic
    ).data;
    if (job.type === "CONSOLIDATE_MEMORIES" && semantic?.skippedSources) {
      return `Consolidation completed · ${pluralize(semantic.skippedSources, "memory", "memories")} skipped`;
    }

    return `${type} succeeded · ${pluralize(job.attempts || 1, "attempt")}`;
  }
  if (job.status === "FAILED") {
    return `${type} failed after ${job.attempts} of ${job.maxAttempts} attempts`;
  }
  if (job.status === "CANCELLED") {
    return `${type} was cancelled · ${pluralize(job.attempts, "attempt")}`;
  }
  if (job.status === "RUNNING") {
    return `${type} is running · attempt ${Math.max(job.attempts, 1)} of ${job.maxAttempts}`;
  }

  return `${type} is queued · up to ${pluralize(job.maxAttempts, "attempt")}`;
}

export function jobTone(status: JobRun["status"]): FeedTone {
  if (status === "FAILED" || status === "CANCELLED") {
    return "danger";
  }
  if (status === "QUEUED" || status === "RUNNING") {
    return "warn";
  }

  return "brand";
}
