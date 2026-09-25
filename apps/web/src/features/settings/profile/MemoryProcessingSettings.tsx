import {
  memoryProcessingCapabilitiesSchema,
  type ProcessingProviderRequest
} from "@funes-vault/shared";
import { useQueryClient } from "@tanstack/react-query";

import { useConfirm } from "../../../components/ui/confirmation-dialog";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { SelectField } from "../../../components/ui/select";
import { useApiOwner, useApiUrl } from "../../../lib/api/api-context";
import { apiQueryKey, queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation, useApiQuery } from "../../../lib/api/use-api";

export function MemoryProcessingSettings() {
  const confirm = useConfirm();
  const client = useQueryClient();
  const apiUrl = useApiUrl();
  const ownerId = useApiOwner();
  const query = useApiQuery({
    key: queryKeys.processing,
    path: "/v1/memory-processing/capabilities",
    schema: memoryProcessingCapabilitiesSchema
  });
  const mutation = useApiMutation({
    path: "/v1/memory-processing/provider",
    schema: memoryProcessingCapabilitiesSchema,
    body: (request: ProcessingProviderRequest) => request,
    invalidate: [queryKeys.processing],
    onSuccess: (data) => {
      client.setQueryData(
        apiQueryKey(apiUrl, queryKeys.processing, ownerId),
        data
      );
    }
  });
  const capabilities = query.data;
  const error = mutation.error
    ? "Could not update the processing provider."
    : query.error
      ? "Could not load memory processing settings."
      : null;
  async function selectProvider(request: ProcessingProviderRequest) {
    if (capabilities?.[request.scope].system === request.system) {
      return;
    }
    const typesafe = request.system === "system_1";
    const extraction = request.scope === "extraction";
    const approved = await confirm({
      title: `Use ${typesafe ? "TypeSafe" : "OpenAI"} for ${extraction ? "extraction" : "consolidation"}?`,
      body: extraction
        ? typesafe
          ? "TypeSafe will receive your latest message and limited preceding context before sensitivity is known. OpenAI will turn selected passages into memory text. Text already sent cannot be recalled."
          : "OpenAI will check your latest message and limited preceding context for memories. Text already sent cannot be recalled."
        : `${typesafe ? "TypeSafe" : "OpenAI"} will compare saved memories at or below INTERNAL, including source information. Text already sent cannot be recalled.`,
      confirmLabel: `Use ${typesafe ? "TypeSafe" : "OpenAI"}`
    });
    if (approved) {
      mutation.mutate(request);
    }
  }

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
              <label htmlFor={`processing-${scope}`}>
                Provider for {title.toLowerCase()}
              </label>
              <SelectField<ProcessingProviderRequest["system"]>
                id={`processing-${scope}`}
                value={task.system}
                disabled={mutation.isPending}
                onValueChange={(system) =>
                  void selectProvider({ scope, system })
                }
                options={[
                  {
                    value: "system_1" as const,
                    disabled: !capabilities.options[scope].typesafe,
                    label: `${scope === "extraction" ? "TypeSafe + OpenAI" : "TypeSafe"}${capabilities.options[scope].typesafe ? "" : " (not configured)"}`
                  },
                  {
                    value: "system_2" as const,
                    disabled: !capabilities.options[scope].openai,
                    label: `OpenAI${capabilities.options[scope].openai ? "" : " (not configured)"}`
                  }
                ]}
              />
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
