import { MemorySuggestionStatus } from "@funes-vault/db";
import { memoryProcessingResultSchema } from "@funes-vault/shared";

import type { StewardEventWriter } from "./steward-event-writer.js";
import type { StewardToolRunState } from "./steward-tool.types.js";

/** Project durable extraction outcomes into chat events; never infer a successful write. */
export function writeProcessingEvents(
  processing: unknown,
  state: { runState: StewardToolRunState; events: StewardEventWriter },
  sourceMessageId?: string
) {
  const capture =
    processing === undefined
      ? undefined
      : memoryProcessingResultSchema.parse(processing);
  if (capture) {
    const saved =
      capture.outcomes?.filter(
        (o) => o.status === MemorySuggestionStatus.APPLIED
      ).length ?? 0;
    const queued =
      capture.outcomes?.filter(
        (o) => o.status === MemorySuggestionStatus.QUEUED_FOR_REVIEW
      ).length ?? 0;
    const pending =
      capture.outcomes?.filter((o) =>
        ["pending_reconciliation", "needs_clarification"].includes(o.status)
      ).length ?? 0;
    state.events.writeStewardEvent({
      type: "tool-trace",
      data: {
        toolCallId: sourceMessageId ?? "capture",
        toolName: "memory_capture",
        label: "Memory processing",
        status: capture.status === "failed" ? "failed" : "completed",
        summary: `${capture.processors?.join(" + ") ?? "Memory processing"}: ${saved} saved, ${queued} queued, ${pending} awaiting clarification.${capture.reason ? ` ${capture.reason.replaceAll("_", " ")}.` : ""}`,
        metadata: { sourceMessageId, status: capture.status }
      }
    });
    for (const outcome of capture.outcomes ?? []) {
      if (
        outcome.status !== MemorySuggestionStatus.APPLIED &&
        outcome.status !== MemorySuggestionStatus.QUEUED_FOR_REVIEW
      ) {
        continue;
      }
      if (
        outcome.suggestionId &&
        outcome.status === MemorySuggestionStatus.QUEUED_FOR_REVIEW
      ) {
        state.runState.suggestedMemoryIds.push(outcome.suggestionId);
      }
      state.events.writeStewardEvent({
        type: "memory-suggestion",
        data: {
          suggestionId: outcome.suggestionId ?? null,
          memoryId: outcome.memoryId ?? null,
          title: outcome.title ?? "Memory",
          status: outcome.status,
          decision:
            outcome.status === MemorySuggestionStatus.APPLIED
              ? "ALLOW"
              : "REQUIRE_CONFIRMATION",
          policyId: null,
          auditEventId: null,
          categoryKeys: outcome.categoryKeys ?? [],
          sensitivity: outcome.sensitivity ?? "INTERNAL"
        }
      });
    }
  }
}
