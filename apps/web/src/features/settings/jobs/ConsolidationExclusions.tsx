import type { ConsolidationSemanticMetadata } from "@funes-vault/shared";

import { label } from "../../../lib/domain/labels";
import { pluralize } from "../../../lib/text";

const reasonLabels: Record<string, string> = {
  above_sensitivity_limit: "above the sensitivity limit for memory comparison",
  not_approved: "not approved for processing",
  expired: "expired; handled by local maintenance",
  secret_like_content: "contained possible credentials",
  unavailable: "no longer available for comparison"
};

export function ConsolidationExclusions({
  semantic
}: {
  semantic: ConsolidationSemanticMetadata;
}) {
  const count = semantic.skippedSources ?? 0;
  const deferredPairs = semantic.deferredPairs ?? 0;
  const excludedPairs = Math.max(
    0,
    (semantic.skippedPairs ?? 0) - deferredPairs
  );
  const reasons = Object.entries(semantic.skippedSourceReasons ?? {}).filter(
    ([reason, total]) => total > 0 && reasonLabels[reason]
  );

  return (
    <>
      {count > 0 ? (
        <div>
          <p>
            {pluralize(count, "memory", "memories")} skipped during memory
            comparison.
          </p>
          {reasons.length ? (
            <ul>
              {reasons.map(([reason, total]) => (
                <li key={reason}>
                  {total} {reasonLabels[reason]}.
                </li>
              ))}
            </ul>
          ) : (
            <p>
              This run did not record the individual reasons for skipping
              memories.
            </p>
          )}
          {semantic.maxSensitivity &&
          (semantic.skippedSourceReasons?.above_sensitivity_limit ?? 0) > 0 ? (
            <p>
              Memory comparison is configured for{" "}
              {label(semantic.maxSensitivity)} sensitivity and below.
            </p>
          ) : null}
          {semantic.status === "completed" ? (
            <p>
              These exclusions follow your processing rules. No retry is needed.
            </p>
          ) : null}
        </div>
      ) : null}
      {excludedPairs > 0 ? (
        <p>
          {pluralize(excludedPairs, "comparison")} skipped
          {semantic.deferredPairs !== undefined
            ? " because one or both memories were excluded by processing rules."
            : "; this older run did not record whether this was due to processing rules or the comparison limit."}
        </p>
      ) : null}
      {deferredPairs > 0 ? (
        <p>
          {pluralize(deferredPairs, "comparison")} left unfinished because this
          run reached its limit.
        </p>
      ) : null}
    </>
  );
}
