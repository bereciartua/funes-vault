"use client";
import {
  type MemoryCategory,
  vaultExportResponseSchema
} from "@funes-vault/shared";
import { FormEvent, useState } from "react";

import { Button } from "../../../components/ui/button";
import { CheckboxField } from "../../../components/ui/checkbox";
import { useConfirm } from "../../../components/ui/confirmation-dialog";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { FormField } from "../../../components/ui/form-field";
import { SelectField } from "../../../components/ui/select";
import {
  SensitivityBadge,
  StatusBadge
} from "../../../components/ui/status-badge";
import { useApiMutation } from "../../../lib/api/use-api";
import { label } from "../../../lib/domain/labels";
import { sensitivities } from "../../../lib/domain/sensitivity";
import { isHighSensitivity } from "../../../lib/domain/sensitivity";
import { downloadJson } from "../../../lib/download";
import { pluralize } from "../../../lib/text";
type ExportFilters = {
  categoryKey: string;
  sensitivity: string;
  createdAfter: string;
  createdBefore: string;
  includeAuditEvents: boolean;
  includeArchived: boolean;
};

const initialFilters: ExportFilters = {
  categoryKey: "",
  sensitivity: "",
  createdAfter: "",
  createdBefore: "",
  includeAuditEvents: false,
  includeArchived: true
};

export function ExportPanel({ categories }: { categories: MemoryCategory[] }) {
  const [filters, setFilters] = useState<ExportFilters>(initialFilters);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const exportMutation = useApiMutation({
    path: (params: string) => `/v1/data/export?${params}`,
    method: "GET",
    schema: vaultExportResponseSchema,
    body: () => undefined
  });
  const isBusy = exportMutation.isPending;
  const selectedSensitivity = sensitivities.find(
    (sensitivity) => sensitivity === filters.sensitivity
  );
  const exportIsBroad =
    !selectedSensitivity || isHighSensitivity(selectedSensitivity);
  async function exportVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (exportIsBroad) {
      const confirmed = await confirm({
        title: "Export vault data?",
        body: selectedSensitivity
          ? `This export includes ${label(selectedSensitivity).toLowerCase()} memories. The downloaded file leaves Funes Vault controls.`
          : "This export can include memories across all sensitivity levels. The downloaded file leaves Funes Vault controls.",
        confirmLabel: "Export",
        tone: "danger"
      });

      if (!confirmed) {
        return;
      }
    }

    setMessage(null);
    setError(null);

    const params = new URLSearchParams();
    if (filters.categoryKey) {
      params.set("categoryKeys", filters.categoryKey);
    }
    if (filters.sensitivity) {
      params.set("sensitivity", filters.sensitivity);
    }
    if (filters.createdAfter) {
      params.set(
        "createdAfter",
        new Date(`${filters.createdAfter}T00:00:00.000Z`).toISOString()
      );
    }
    if (filters.createdBefore) {
      params.set(
        "createdBefore",
        new Date(`${filters.createdBefore}T23:59:59.999Z`).toISOString()
      );
    }
    if (filters.includeAuditEvents) {
      params.set("includeAuditEvents", "true");
    }
    if (!filters.includeArchived) {
      params.set("includeArchived", "false");
    }

    try {
      const parsed = await exportMutation.mutateAsync(params.toString());
      downloadJson(
        parsed.export,
        `funes-vault-export-${new Date().toISOString().slice(0, 10)}.json`
      );
      setMessage(
        `Exported ${pluralize(parsed.export.memories.length, "memory", "memories")}.`
      );
    } catch {
      setError("Could not export vault data.");
    }
  }

  return (
    <>
      {" "}
      <form className="data-panel" onSubmit={exportVault}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Export</p>
            <h2>Vault JSON</h2>
          </div>
          <Button type="submit" disabled={isBusy}>
            {isBusy ? "Working..." : "Download"}
          </Button>
        </div>
        <div className="data-scope-summary">
          <StatusBadge
            descriptor={{
              icon: exportIsBroad ? "ShieldAlert" : "ShieldCheck",
              label: exportIsBroad ? "Broad export" : "Narrow export",
              tone: exportIsBroad ? "risk" : "safe"
            }}
          />
          {selectedSensitivity ? (
            <SensitivityBadge sensitivity={selectedSensitivity} />
          ) : (
            <StatusBadge
              descriptor={{
                icon: "Globe",
                label: "All sensitivities",
                tone: "risk"
              }}
            />
          )}
        </div>
        <div className="form-grid">
          <FormField label="Category">
            <SelectField
              ariaLabel="Export category"
              value={filters.categoryKey}
              options={[
                { label: "All categories", value: "" },
                ...categories.map((category) => ({
                  label: category.name,
                  value: category.key
                }))
              ]}
              onValueChange={(categoryKey) =>
                setFilters((current) => ({
                  ...current,
                  categoryKey
                }))
              }
            />
          </FormField>
          <FormField label="Sensitivity">
            <SelectField
              ariaLabel="Export sensitivity"
              value={filters.sensitivity}
              options={[
                { label: "Any", value: "" },
                ...sensitivities.map((sensitivity) => ({
                  label: label(sensitivity),
                  value: sensitivity
                }))
              ]}
              onValueChange={(sensitivity) =>
                setFilters((current) => ({
                  ...current,
                  sensitivity
                }))
              }
            />
          </FormField>
          <FormField label="Created after">
            <input
              type="date"
              value={filters.createdAfter}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  createdAfter: event.target.value
                }))
              }
            />
          </FormField>
          <FormField label="Created before">
            <input
              type="date"
              value={filters.createdBefore}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  createdBefore: event.target.value
                }))
              }
            />
          </FormField>
        </div>
        <CheckboxField
          checked={filters.includeArchived}
          className="checkbox-line"
          onCheckedChange={(includeArchived) =>
            setFilters((current) => ({
              ...current,
              includeArchived
            }))
          }
        >
          Include archived memories
        </CheckboxField>
        <p className="field-hint">
          {filters.includeArchived
            ? "Full backup: archived memories are exported and restore as archived."
            : "Lean export: only your current, non-archived memories are included."}
        </p>
        <CheckboxField
          checked={filters.includeAuditEvents}
          className="checkbox-line"
          onCheckedChange={(includeAuditEvents) =>
            setFilters((current) => ({
              ...current,
              includeAuditEvents
            }))
          }
        >
          Include audit event references
        </CheckboxField>
        <p className="field-hint">
          {filters.includeAuditEvents
            ? "The export will include references to your audit trail."
            : "The export will contain memories only, without audit references."}
        </p>
      </form>
      <FeedbackMessages message={message} error={error} />
    </>
  );
}
