import {
  memoryProcessingCapabilitiesSchema,
  type ProcessingProviderRequest
} from "@funes-vault/shared";

import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation, useApiQuery } from "../../../lib/api/use-api";

export function MemoryProcessingSettings() {
  const query = useApiQuery({
    key: queryKeys.processing,
    path: "/v1/memory-processing/capabilities",
    schema: memoryProcessingCapabilitiesSchema
  });
  const mutation = useApiMutation({
    path: "/v1/memory-processing/provider",
    schema: memoryProcessingCapabilitiesSchema,
    body: (request: ProcessingProviderRequest) => request,
    invalidate: [queryKeys.processing]
  });
  const capabilities = query.data;
  const error = mutation.error
    ? "Could not update the processing provider."
    : query.error
      ? "Could not load memory processing settings."
      : null;

  return (
    <section className="form-stack">
      <h3>Memory processing</h3>
      <p>
        Choose a provider for each task. Chat answers, voice audio, and explicit
        memory edits continue to use OpenAI.
      </p>
      {capabilities ? (
        (["extraction", "consolidation"] as const).map((scope) => {
          const task = capabilities[scope];
          const title =
            scope === "extraction"
              ? "Conversational extraction"
              : "Saved-memory consolidation";

          return (
            <div key={scope}>
              <h4>{title}</h4>
              <label>
                Provider for {title.toLowerCase()}
                <select
                  value={task.system}
                  disabled={mutation.isPending}
                  onChange={(event) =>
                    mutation.mutate({
                      scope,
                      system: event.target
                        .value as ProcessingProviderRequest["system"]
                    })
                  }
                >
                  <option
                    value="system_1"
                    disabled={!capabilities.options[scope].typesafe}
                  >
                    {scope === "extraction" ? "TypeSafe + OpenAI" : "TypeSafe"}
                    {!capabilities.options[scope].typesafe
                      ? " (not configured)"
                      : ""}
                  </option>
                  <option
                    value="system_2"
                    disabled={!capabilities.options[scope].openai}
                  >
                    OpenAI
                    {!capabilities.options[scope].openai
                      ? " (not configured)"
                      : ""}
                  </option>
                </select>
              </label>
              <p>
                {task.available
                  ? `Using ${task.model}`
                  : "Provider unavailable"}
              </p>
              {scope === "extraction" ? (
                <p>
                  {task.system === "system_1"
                    ? "TypeSafe checks your latest message and limited conversation context before sensitivity is known. OpenAI turns selected passages into memory text."
                    : "OpenAI checks your latest message and limited conversation context for useful memories."}{" "}
                  Voice audio goes to OpenAI.
                </p>
              ) : (
                <p>
                  {task.system === "system_1" ? "TypeSafe" : "OpenAI"} compares
                  saved memories at or below{" "}
                  {capabilities.consolidation.maxSensitivity}, including their
                  source information. Consolidation scheduling and review
                  settings are separate.
                </p>
              )}
            </div>
          );
        })
      ) : (
        <p>Loading providers…</p>
      )}
      <FeedbackMessages error={error} />
    </section>
  );
}
