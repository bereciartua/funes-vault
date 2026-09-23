"use client";
import {
  consolidationSemanticMetadataSchema,
  type JobRun
} from "@funes-vault/shared";

import { SubjectChips } from "../../../components/SubjectChips";
import { Button } from "../../../components/ui/button";
import { formatDateTime } from "../../../lib/dates";
import { label } from "../../../lib/domain/labels";
import { pluralize } from "../../../lib/text";
import { consolidationActionSubjects } from "./consolidation-subjects";
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
  const canRetry = job.status === "FAILED" || job.status === "CANCELLED";

  return (
    <section className="job-detail" aria-label="Job run details">
      {job.error ? <pre className="job-error">{job.error}</pre> : null}
      <p>
        {job.attempts} of {job.maxAttempts} attempts
        {job.startedAt ? ` · started ${formatDateTime(job.startedAt)}` : ""}
        {job.finishedAt ? ` · finished ${formatDateTime(job.finishedAt)}` : ""}
      </p>
      {semantic ? (
        <p>
          Semantic processing: {semantic.status} · {semantic.model} ·{" "}
          {semantic.skippedPairs ?? 0} pairs skipped
        </p>
      ) : null}
      {consolidation ? (
        <>
          <p>
            {pluralize(
              consolidation.inspectedMemoryCount,
              "memory",
              "memories"
            )}{" "}
            inspected · {pluralize(consolidation.candidateCount, "candidate")} ·{" "}
            {pluralize(consolidation.suggestionsCreated, "suggestion")} ·{" "}
            {pluralize(consolidation.actionsAutoApplied, "change")} applied ·{" "}
            {pluralize(consolidation.noActionPairs, "pair")} unchanged
          </p>
          <div className="job-action-list">
            {consolidation.actions.length === 0 ? (
              <p className="muted">No consolidation actions were produced.</p>
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
