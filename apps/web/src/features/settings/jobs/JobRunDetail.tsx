"use client";
import {
  consolidationFailureMessage,
  consolidationSemanticMetadataSchema,
  type JobRun
} from "@funes-vault/shared";

import { SubjectChips } from "../../../components/SubjectChips";
import { Button } from "../../../components/ui/button";
import { formatDateTime } from "../../../lib/dates";
import { label } from "../../../lib/domain/labels";
import { pluralize } from "../../../lib/text";
import { consolidationActionSubjects } from "./consolidation-subjects";
import { ConsolidationExclusions } from "./ConsolidationExclusions";
export function JobRunDetail({
  job,
  onRetry,
  retrying
}: {
  job: JobRun;
  onRetry: () => void;
  retrying: boolean;
}) {
  const consolidation = job.consolidation;
  const semantic = consolidationSemanticMetadataSchema.safeParse(
    job.metadata.semantic
  ).data;
  const needsChange =
    semantic &&
    [
      "processing_consent_required",
      "processing_provider_changed",
      "provider_not_configured",
      "source_versions_changed",
      "secret_like_content",
      "pair_limit_reached"
    ].includes(semantic.reason ?? "");
  const canRetry =
    (job.status === "FAILED" || job.status === "CANCELLED") && !needsChange;
  const error =
    job.error && semantic?.reason
      ? consolidationFailureMessage(semantic.reason)
      : job.error;
  const allSourcesExcluded =
    (semantic?.skippedSources ?? 0) > 0 &&
    (semantic?.skippedSources ?? 0) >= (consolidation?.recentMemoryCount ?? 0);

  return (
    <section className="job-detail" aria-label="Job run details">
      {error ? <p className="job-error">{error}</p> : null}
      <p>
        {job.attempts} of {job.maxAttempts} attempts
        {job.startedAt ? ` · started ${formatDateTime(job.startedAt)}` : ""}
        {job.finishedAt ? ` · finished ${formatDateTime(job.finishedAt)}` : ""}
      </p>
      {semantic ? <ConsolidationExclusions semantic={semantic} /> : null}
      {consolidation ? (
        <>
          <p>
            {pluralize(
              consolidation.inspectedMemoryCount,
              "memory",
              "memories"
            )}{" "}
            considered · {pluralize(consolidation.candidateCount, "candidate")}{" "}
            · {pluralize(consolidation.suggestionsCreated, "suggestion")} ·{" "}
            {pluralize(consolidation.actionsAutoApplied, "change")} applied
          </p>
          <div className="job-action-list">
            {consolidation.actions.length === 0 ? (
              <p className="muted">
                {job.status === "SUCCEEDED"
                  ? allSourcesExcluded
                    ? "No memories were eligible for comparison. Local maintenance produced no changes."
                    : "No consolidation changes were needed for the memories checked."
                  : "No consolidation changes were produced by this run."}
              </p>
            ) : (
              consolidation.actions.map((action) => (
                <article
                  key={`${action.targetMemoryId}-${action.reason}-${action.suggestionId ?? action.auditEventId ?? "pending"}`}
                  className="job-action-row"
                >
                  <div>
                    <strong>{label(action.reason)}</strong>
                    <p>{action.evidence}</p>
                    <small>
                      {action.applied ? "Applied" : "Queued"} ·{" "}
                      {Math.round(action.confidence * 100)}% confidence
                    </small>
                  </div>
                  <SubjectChips
                    subjects={consolidationActionSubjects(action)}
                  />
                </article>
              ))
            )}
          </div>
        </>
      ) : null}
      {canRetry ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      ) : null}
    </section>
  );
}
