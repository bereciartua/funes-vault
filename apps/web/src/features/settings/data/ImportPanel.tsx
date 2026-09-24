"use client";
import {
  type ImportVaultPreview,
  type ImportVaultPreviewResponse,
  importVaultPreviewResponseSchema,
  type ImportVaultResponse,
  importVaultResponseSchema
} from "@funes-vault/shared";
import { ChangeEvent, useState } from "react";

import { Button } from "../../../components/ui/button";
import { useConfirm } from "../../../components/ui/confirmation-dialog";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { FormField } from "../../../components/ui/form-field";
import { SelectField } from "../../../components/ui/select";
import { StatusBadge } from "../../../components/ui/status-badge";
import { queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation } from "../../../lib/api/use-api";
import { pluralize } from "../../../lib/text";
type ImportMode = "SUGGESTIONS" | "ACTIVE_MEMORIES";
function normalizeImportPayload(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "export" in value &&
    typeof value.export === "object"
  ) {
    return value;
  }

  return { export: value };
}

export function ImportPanel() {
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("SUGGESTIONS");
  const [preview, setPreview] = useState<ImportVaultPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const previewMutation = useApiMutation({
    path: "/v1/data/import/preview",
    schema: importVaultPreviewResponseSchema,
    body: (payload: ReturnType<typeof normalizeImportPayload>) => payload
  });
  const importMutation = useApiMutation({
    path: "/v1/data/import",
    schema: importVaultResponseSchema,
    body: (
      payload: ReturnType<typeof normalizeImportPayload> & { mode: ImportMode }
    ) => payload,
    invalidate: [
      queryKeys.categories,
      queryKeys.memories.all,
      queryKeys.suggestions.all,
      queryKeys.overview,
      queryKeys.clients.all,
      queryKeys.policies.all,
      queryKeys.audit.all
    ]
  });
  const isBusy = previewMutation.isPending || importMutation.isPending;
  const importIsHighImpact =
    importMode === "ACTIVE_MEMORIES" ||
    Boolean(preview && (preview.clients > 0 || preview.policies > 0));
  async function loadImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setImportText(await file.text());
    setPreview(null);
    setMessage(null);
    setError(null);
  }

  function parseImportText() {
    try {
      return normalizeImportPayload(JSON.parse(importText));
    } catch {
      setError("Import file must be valid JSON.");

      return null;
    }
  }

  async function previewImport() {
    const payload = parseImportText();
    if (!payload) {
      return;
    }

    setMessage(null);
    setError(null);

    let parsed: ImportVaultPreviewResponse;
    try {
      parsed = await previewMutation.mutateAsync(payload);
    } catch {
      setError("Could not validate this import file.");
      setPreview(null);

      return;
    }

    setPreview(parsed.preview);
    setMessage(
      `Preview ready for ${pluralize(parsed.preview.memories, "memory", "memories")}.`
    );
  }

  async function applyImport() {
    const payload = parseImportText();
    if (!payload) {
      return;
    }
    if (!preview) {
      setError("Preview this import before applying it.");

      return;
    }

    if (importIsHighImpact) {
      const confirmed = await confirm({
        title: "Apply high-impact import?",
        body:
          importMode === "ACTIVE_MEMORIES"
            ? "Active-memory import writes directly into your vault instead of creating review suggestions."
            : "This import includes client or app permission records that can affect future disclosure behavior.",
        confirmLabel: "Apply import",
        tone: "danger"
      });

      if (!confirmed) {
        return;
      }
    }

    setMessage(null);
    setError(null);

    let parsed: ImportVaultResponse;
    try {
      parsed = await importMutation.mutateAsync({
        ...payload,
        mode: importMode
      });
    } catch {
      setError("Could not import this vault data.");

      return;
    }

    setMessage(
      importMode === "SUGGESTIONS"
        ? `Created ${pluralize(parsed.imported.suggestionsCreated, "review suggestion")}.` +
            (parsed.imported.memoriesCreated > 0
              ? ` Restored ${pluralize(parsed.imported.memoriesCreated, "archived memory", "archived memories")}.`
              : "")
        : `Created ${pluralize(parsed.imported.memoriesCreated, "memory", "memories")}.`
    );
    setPreview(null);
    setImportText("");
  }

  return (
    <>
      {" "}
      <section className="data-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Import</p>
            <h2>Restore or review</h2>
          </div>
          <div className="detail-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={isBusy}
              onClick={previewImport}
            >
              Preview
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isBusy || !preview}
              onClick={applyImport}
            >
              Import
            </Button>
          </div>
        </div>
        <div className="form-grid">
          <FormField label="JSON file">
            <input
              type="file"
              accept="application/json"
              onChange={loadImportFile}
            />
          </FormField>
          <FormField label="Import mode">
            <SelectField
              ariaLabel="Import mode"
              value={importMode}
              options={[
                { label: "Suggestions", value: "SUGGESTIONS" },
                { label: "Active memories", value: "ACTIVE_MEMORIES" }
              ]}
              onValueChange={setImportMode}
            />
          </FormField>
        </div>
        <div
          className="risk-note"
          data-tone={importMode === "ACTIVE_MEMORIES" ? "risk" : "safe"}
        >
          <StatusBadge
            descriptor={{
              icon: importMode === "ACTIVE_MEMORIES" ? "ShieldAlert" : "Inbox",
              label:
                importMode === "ACTIVE_MEMORIES"
                  ? "Creates active memories"
                  : "Creates review suggestions",
              tone: importMode === "ACTIVE_MEMORIES" ? "risk" : "safe"
            }}
          />
          <p>
            {importMode === "ACTIVE_MEMORIES"
              ? "Imported memories return in their exported state — active memories become durable vault context immediately, archived ones stay archived."
              : "Imported active memories enter the review inbox first. Archived memories are restored directly as archived, without cluttering the inbox."}
          </p>
        </div>
        <FormField label="JSON">
          <textarea
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setPreview(null);
            }}
            rows={8}
          />
        </FormField>
        {preview ? (
          <div className="import-preview">
            <dl className="metadata-list">
              <div>
                <dt>Memories</dt>
                <dd>{preview.memories}</dd>
              </div>
              {preview.archivedMemories > 0 ? (
                <div>
                  <dt>Of which archived</dt>
                  <dd>{preview.archivedMemories}</dd>
                </div>
              ) : null}
              <div>
                <dt>Categories</dt>
                <dd>{preview.categories}</dd>
              </div>
              <div>
                <dt>Clients</dt>
                <dd>{preview.clients}</dd>
              </div>
              <div>
                <dt>App permissions</dt>
                <dd>{preview.policies}</dd>
              </div>
              <div>
                <dt>Audit refs</dt>
                <dd>{preview.auditEvents}</dd>
              </div>
              <div>
                <dt>Duplicates</dt>
                <dd>{preview.possibleDuplicateMemories.length}</dd>
              </div>
            </dl>
            {preview.possibleDuplicateMemories.length > 0 ? (
              <div className="duplicate-list">
                {preview.possibleDuplicateMemories.map((duplicate) => (
                  <div key={`${duplicate.importedId}-${duplicate.existingId}`}>
                    <strong>{duplicate.title}</strong>
                    <small>
                      Imported {duplicate.importedId} may match existing{" "}
                      {duplicate.existingId}
                    </small>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      <FeedbackMessages message={message} error={error} />
    </>
  );
}
