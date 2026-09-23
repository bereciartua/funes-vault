"use client";
import {
  type MemoryProcessingResult,
  memoryProcessingResultSchema
} from "@funes-vault/shared";
import Link from "next/link";

import { Button } from "../../../components/ui/button";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation } from "../../../lib/api/use-api";
import { processorLabel } from "../../../lib/domain/processing";
export function MemoryProcessingOutcome({
  initial
}: {
  initial?: MemoryProcessingResult;
}) {
  const mutation = useApiMutation({
    path: (sourceId: string) =>
      `/v1/memory-processing/sources/${sourceId}/retry`,
    schema: memoryProcessingResultSchema,
    body: () => undefined,
    invalidate: [
      queryKeys.suggestions.all,
      queryKeys.memories.all,
      queryKeys.overview,
      queryKeys.chat.all
    ]
  });
  const result = mutation.data ?? initial;
  const busy = mutation.isPending;
  const error = mutation.isError;
  if (!result) {
    return null;
  }
  const outcomes = result.outcomes ?? [];
  const saved = outcomes.filter(
    (o) => o.status === "APPLIED" || o.status === "reconciled"
  ).length;
  const queued = outcomes.filter(
    (o) => o.status === "QUEUED_FOR_REVIEW"
  ).length;
  const pending = outcomes.filter((o) =>
    ["pending_reconciliation", "needs_clarification"].includes(o.status)
  ).length;
  const processors =
    result.processors?.map(processorLabel).join(" + ") ?? "Memory processing";
  function retry() {
    if (result?.sourceMessageId) {
      mutation.mutate(result.sourceMessageId);
    }
  }

  return (
    <div className="processing-outcome" aria-live="polite">
      {result.status === "partial" ? (
        <p>Some content could not be processed.</p>
      ) : null}
      {result.reason === "secret_like_content" ? (
        <p>
          Memory processing was skipped because this text appears to contain a
          secret.
        </p>
      ) : null}
      <p>
        {processors}:{" "}
        {result.status === "failed"
          ? "processing failed; no new memories saved"
          : result.status === "skipped"
            ? "processing skipped"
            : result.status === "pending" || result.status === "running"
              ? "processing"
              : `${saved} saved, ${queued} queued${pending ? `, ${pending} awaiting clarification` : ""}`}
      </p>
      {result.reason === "processing_consent_required" ? (
        <Link href="/settings/profile">
          Enable memory processing in settings
        </Link>
      ) : null}
      {typeof result.sourceMessageId === "string" &&
      ["failed", "skipped"].includes(String(result.status)) ? (
        <Button disabled={busy} onClick={() => void retry()}>
          {busy ? "Retrying…" : "Retry memory processing"}
        </Button>
      ) : null}
      <FeedbackMessages
        error={error ? "Could not retry memory processing." : null}
      />
    </div>
  );
}
