import {
  memoryProcessingCapabilitiesSchema,
  type ProcessingConsentRequest,
  processingConsentSchema
} from "@funes-vault/shared";

import { Button } from "../../../components/ui/button";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation, useApiQuery } from "../../../lib/api/use-api";
import { processorLabel } from "../../../lib/domain/processing";
export function MemoryProcessingSettings() {
  const query = useApiQuery({
    key: queryKeys.processing,
    path: "/v1/memory-processing/capabilities",
    schema: memoryProcessingCapabilitiesSchema
  });
  const mutation = useApiMutation({
    path: "/v1/memory-processing/consent",
    schema: processingConsentSchema,
    body: (request: ProcessingConsentRequest) => request,
    invalidate: [queryKeys.processing]
  });
  const capabilities = query.data;
  const busy = mutation.isPending;
  const error = mutation.error
    ? "Could not update processing permission."
    : query.error
      ? "Could not load memory processing settings."
      : null;
  function consent(scope: ProcessingConsentRequest["scope"], granted: boolean) {
    mutation.mutate({ scope, granted, version: 1 });
  }

  return (
    <section className="form-stack">
      <h3>Memory processing</h3>
      <p>
        Memory extraction checks your latest message and limited conversation
        context for useful memories. Consolidation reviews related saved
        memories. Chat, voice, and explicit memory edits continue to use OpenAI.
      </p>
      {capabilities ? (
        (["extraction", "consolidation"] as const).map((scope) => {
          const task = capabilities[scope];
          const granted = capabilities.consents.some(
            (c) =>
              c.processor === "typesafe" &&
              c.scope === scope &&
              c.version === 1 &&
              !c.revokedAt
          );

          return (
            <div key={scope}>
              <h4>
                {scope === "extraction"
                  ? "Conversational extraction"
                  : "Saved-memory consolidation"}
              </h4>
              <p>
                {task.processors.map(processorLabel).join(" + ")} · {task.model}{" "}
                · {task.available ? "Available" : "Unavailable"}
              </p>
              {scope === "consolidation" ? (
                <p>
                  Only memories at or below{" "}
                  {capabilities.consolidation.maxSensitivity} are sent for
                  review.
                </p>
              ) : null}
              {task.processors.includes("typesafe") || granted ? (
                <>
                  <p>
                    {scope === "extraction"
                      ? "Allow TypeSafe, the memory classifier, to process your latest message and limited preceding context before sensitivity is known. OpenAI turns selected passages into memory text; TypeSafe checks the result. Voice audio still goes to OpenAI."
                      : "Allow TypeSafe, the memory classifier, to compare permitted saved-memory pairs, including their source information, to propose archival."}{" "}
                    Revoking stops future processing; text already sent cannot
                    be recalled.
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() => void consent(scope, !granted)}
                  >
                    {granted
                      ? `Revoke TypeSafe ${scope}`
                      : `Allow TypeSafe ${scope}`}
                  </Button>
                </>
              ) : null}
            </div>
          );
        })
      ) : (
        <p>Loading processors…</p>
      )}
      <FeedbackMessages error={error} />
    </section>
  );
}
