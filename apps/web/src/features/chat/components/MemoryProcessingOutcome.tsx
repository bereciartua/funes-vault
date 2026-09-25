"use client";
import {
  memoryProcessingCapabilitiesSchema,
  type MemoryProcessingResult,
  memoryProcessingResultSchema,
  memoryRequestReasonLabel,
  memoryRequestReasonSchema
} from "@funes-vault/shared";
import Link from "next/link";

import { Button } from "../../../components/ui/button";
import { useConfirm } from "../../../components/ui/confirmation-dialog";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation, useApiQuery } from "../../../lib/api/use-api";
import { processorLabel } from "../../../lib/domain/processing";
import { canRetryProcessing, processingReason } from "./processing-reason";
export function MemoryProcessingOutcome({
  initial
}: {
  initial?: MemoryProcessingResult;
}) {
  const confirm = useConfirm();
  const capabilities = useApiQuery({
    key: queryKeys.processing,
    path: "/v1/memory-processing/capabilities",
    schema: memoryProcessingCapabilitiesSchema
  });
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
  const reprocess = useApiMutation({
    path: (sourceId: string) =>
      `/v1/memory-processing/sources/${sourceId}/reprocess`,
    schema: memoryProcessingResultSchema,
    body: () => undefined,
    invalidate: [
      queryKeys.suggestions.all,
      queryKeys.memories.all,
      queryKeys.overview,
      queryKeys.chat.all
    ]
  });
  const result = reprocess.data ?? mutation.data ?? initial;
  const busy = mutation.isPending || reprocess.isPending;
  const error = mutation.isError || reprocess.isError;
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
  const denied = outcomes.filter((o) => o.status === "DENIED");
  const denialReasons = [
    ...new Set(
      denied
        .map((outcome) => memoryRequestReasonSchema.safeParse(outcome.reason))
        .map((parsed) => (parsed.success ? parsed.data : null))
    )
  ];
  const pending = outcomes.filter((o) =>
    ["pending_reconciliation", "needs_clarification"].includes(o.status)
  ).length;
  const processors =
    result.processors?.map(processorLabel).join(" + ") ?? "Memory processing";
  const explanation = processingReason(result.reason);
  const reason = result.reason;
  const sourceMessageId =
    typeof result.sourceMessageId === "string" ? result.sourceMessageId : null;
  const selectedProvider =
    capabilities.data?.extraction.system === "system_1"
      ? "TypeSafe"
      : capabilities.data?.extraction.system === "system_2"
        ? "OpenAI"
        : null;
  function retry() {
    if (sourceMessageId) {
      mutation.mutate(sourceMessageId);
    }
  }
  async function reprocessCurrent() {
    if (!sourceMessageId || !selectedProvider) {
      return;
    }
    if (
      reason === "processing_consent_required" &&
      selectedProvider === "TypeSafe"
    ) {
      const approved = await confirm({
        title: "Reprocess with TypeSafe?",
        body: "TypeSafe will receive your latest message and limited preceding context before sensitivity is known. OpenAI will turn selected passages into memory text. Text already sent cannot be recalled.",
        confirmLabel: "Reprocess with TypeSafe"
      });
      if (!approved) {
        return;
      }
    }
    reprocess.mutate(sourceMessageId);
  }

  return (
    <div className="processing-outcome" aria-live="polite">
      {result.status === "partial" ? (
        <p>Some content could not be processed.</p>
      ) : null}
      {explanation ? <p>{explanation}</p> : null}
      <p>
        {processors}:{" "}
        {result.reason === "transcript_persistence_failed"
          ? "save status unconfirmed"
          : result.status === "failed"
            ? "processing failed; no new memories saved"
            : result.status === "skipped"
              ? "processing skipped; no new memories saved"
              : result.status === "pending" || result.status === "running"
                ? "processing"
                : `${saved} saved, ${queued} queued${denied.length ? `, ${denied.length} denied` : ""}${pending ? `, ${pending} awaiting clarification` : ""}`}
      </p>
      {denialReasons.map((reason) => (
        <p key={reason ?? "unspecified"}>
          {reason
            ? memoryRequestReasonLabel(reason)
            : "The proposal was denied."}
        </p>
      ))}
      {denied.some((outcome) => outcome.reason === "no_client_policy") ? (
        <Link href="/settings/clients">Manage App permissions</Link>
      ) : null}
      {result.reason === "processing_consent_required" ? (
        <Link href="/settings/profile">
          Choose a memory processing provider
        </Link>
      ) : null}
      {canRetryProcessing(result.reason) &&
      result.reason !== "processing_provider_changed" &&
      result.reason !== "processing_consent_required" &&
      sourceMessageId &&
      ["failed", "skipped"].includes(String(result.status)) ? (
        <Button disabled={busy} onClick={() => void retry()}>
          {busy ? "Retrying…" : "Retry memory processing"}
        </Button>
      ) : null}
      {["processing_provider_changed", "processing_consent_required"].includes(
        result.reason ?? ""
      ) &&
      sourceMessageId &&
      ["failed", "skipped"].includes(String(result.status)) ? (
        <Button
          disabled={busy || !selectedProvider}
          onClick={() => void reprocessCurrent()}
        >
          {busy
            ? "Reprocessing…"
            : `Reprocess with ${selectedProvider ?? "selected provider"}`}
        </Button>
      ) : null}
      <FeedbackMessages
        error={
          error
            ? reprocess.isError
              ? "Could not reprocess memory."
              : "Could not retry memory processing."
            : null
        }
      />
    </div>
  );
}
