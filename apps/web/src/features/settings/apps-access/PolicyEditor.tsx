import { type MemoryCategory, type Policy } from "@funes-vault/shared";

import { Button } from "../../../components/ui/button";
import { CheckboxField } from "../../../components/ui/checkbox";
import { FormField } from "../../../components/ui/form-field";
import { SelectField } from "../../../components/ui/select";
import { label } from "../../../lib/domain/labels";
import {
  policyRiskFactors,
  policySummary
} from "../../../lib/domain/policy-summary";
import { CategoryAccessMatrix } from "./CategoryAccessMatrix";
import {
  operations,
  sensitivities,
  togglePolicyOperation
} from "./policy-draft";
import type { PolicyWorkspace } from "./use-policy-workspace";
export function PolicyEditor({
  editingPolicy,
  model,
  categories
}: {
  editingPolicy: Policy | null;
  model: PolicyWorkspace;
  categories: MemoryCategory[];
}) {
  const {
    draftPolicy,
    policyDraft,
    setPolicyDraft,
    savePolicy,
    isSaving,
    confirmDeletePolicy,
    setPolicyEditor
  } = model;
  const toggleOperation = (operation: Policy["operations"][number]) =>
    setPolicyDraft((current) => togglePolicyOperation(current, operation));

  return (
    <div className="policy-editor">
      <div className="policy-summary">
        <p>{policySummary(draftPolicy, model.isFirstParty)}</p>
        {policyRiskFactors(draftPolicy, categories.length).length > 0 ? (
          <p className="risk-sentence">
            {policyRiskFactors(draftPolicy, categories.length)
              .map((factor) => factor.label)
              .join(" · ")}{" "}
            — consider tightening these permissions.
          </p>
        ) : null}
      </div>
      <form className="form-stack" onSubmit={savePolicy}>
        <div className="form-grid">
          <FormField label="Max sensitivity">
            <SelectField
              ariaLabel="App permissions max sensitivity"
              value={policyDraft.maxSensitivity}
              options={sensitivities.map((sensitivity) => ({
                label: label(sensitivity),
                value: sensitivity
              }))}
              onValueChange={(maxSensitivity) =>
                setPolicyDraft((current) => ({
                  ...current,
                  maxSensitivity
                }))
              }
            />
          </FormField>
          <FormField label="Expires">
            <input
              type="date"
              value={policyDraft.expiresAt}
              onChange={(event) =>
                setPolicyDraft((current) => ({
                  ...current,
                  expiresAt: event.target.value
                }))
              }
            />
          </FormField>
        </div>

        <fieldset>
          <legend>Allowed operations</legend>
          <div className="category-options">
            {operations.map((operation) => (
              <CheckboxField
                key={operation}
                checked={policyDraft.operations.includes(operation)}
                onCheckedChange={() => toggleOperation(operation)}
              >
                {label(operation)}
              </CheckboxField>
            ))}
          </div>
          <CheckboxField
            checked={policyDraft.requiresConfirmation}
            onCheckedChange={(requiresConfirmation) =>
              setPolicyDraft((current) => ({
                ...current,
                requiresConfirmation
              }))
            }
          >
            Ask me before each disclosure
          </CheckboxField>
        </fieldset>

        <CategoryAccessMatrix
          categories={categories}
          draft={policyDraft}
          setDraft={setPolicyDraft}
        />

        <div className="form-actions">
          <Button type="submit" variant="secondary" disabled={isSaving}>
            {isSaving ? "Saving..." : editingPolicy ? "Save" : "Create"}
          </Button>
          {editingPolicy ? (
            <Button
              variant="danger"
              type="button"
              disabled={isSaving}
              onClick={() => void confirmDeletePolicy(editingPolicy)}
            >
              Remove permissions
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={() => setPolicyEditor(null)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
