"use client";

import { Button } from "../../../components/ui/button";
import { CheckboxField } from "../../../components/ui/checkbox";
import { FormField } from "../../../components/ui/form-field";
import { SelectField } from "../../../components/ui/select";
import { label } from "../../../lib/domain/labels";
import {
  isHighSensitivity,
  sensitivityDescription
} from "../../../lib/domain/sensitivity";
import type { MemoryWorkspace } from "../hooks/use-memory-workspace";
import {
  memoryKinds,
  reviewStates,
  sensitivities,
  sourceTypes,
  statuses
} from "../memory-constants";
import { confidenceToPercent, percentToConfidence } from "../memory-draft";

export function MemoryEditor(props: MemoryWorkspace["editor"]) {
  const {
    draft,
    setDraft,
    editorMode,
    toggleCategory,
    categories,
    isSaving,
    saveMemory,
    cancelEditor
  } = props;

  return (
    <section className="editor-panel" aria-label="Memory editor">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">
            {editorMode === "edit" ? "Editing" : "New durable memory"}
          </p>
          <h2>{editorMode === "edit" ? "Edit memory" : "Create memory"}</h2>
        </div>
      </div>
      {isHighSensitivity(draft.sensitivity) ? (
        <p className="risk-note" data-tone="risk">
          {label(draft.sensitivity)} memories can expose sensitive context. Keep
          them narrow, specific, and policy-gated.
        </p>
      ) : (
        <p className="editor-note">
          Active memories are durable vault context. Use suggestions when the
          content still needs review.
        </p>
      )}
      <form className="form-stack" onSubmit={saveMemory}>
        <FormField label="Title" required>
          <input
            value={draft.title}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                title: event.target.value
              }))
            }
            required
          />
        </FormField>
        <FormField label="Body" required>
          <textarea
            value={draft.body}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                body: event.target.value
              }))
            }
            rows={6}
            required
          />
        </FormField>
        <div className="form-grid">
          <FormField label="Kind">
            <SelectField
              ariaLabel="Memory kind"
              value={draft.kind}
              options={memoryKinds.map((kind) => ({
                label: label(kind),
                value: kind
              }))}
              onValueChange={(kind) =>
                setDraft((current) => ({
                  ...current,
                  kind: kind
                }))
              }
            />
          </FormField>
          <FormField label="Sensitivity">
            <SelectField
              ariaLabel="Memory sensitivity"
              value={draft.sensitivity}
              options={sensitivities.map((sensitivity) => ({
                label: label(sensitivity),
                value: sensitivity
              }))}
              onValueChange={(sensitivity) =>
                setDraft((current) => ({
                  ...current,
                  sensitivity: sensitivity
                }))
              }
            />
            <span className="field-hint">
              {sensitivityDescription(draft.sensitivity)}
            </span>
          </FormField>
          <FormField label="Expires">
            <input
              type="date"
              value={draft.expiresAt}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  expiresAt: event.target.value
                }))
              }
            />
            <span className="field-hint">
              Leave empty to keep this memory until you remove it.
            </span>
          </FormField>
        </div>
        {editorMode === "edit" ? (
          <div className="form-grid">
            <FormField label="Status">
              <SelectField
                ariaLabel="Memory status"
                value={draft.status}
                options={statuses.map((status) => ({
                  label: label(status),
                  value: status
                }))}
                onValueChange={(status) =>
                  setDraft((current) => ({
                    ...current,
                    status: status
                  }))
                }
              />
            </FormField>
            <FormField label="Review">
              <SelectField
                ariaLabel="Memory review state"
                value={draft.reviewState}
                options={reviewStates.map((reviewState) => ({
                  label: label(reviewState),
                  value: reviewState
                }))}
                onValueChange={(reviewState) =>
                  setDraft((current) => ({
                    ...current,
                    reviewState: reviewState
                  }))
                }
              />
            </FormField>
            <FormField label="Confidence (%)">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={confidenceToPercent(draft.confidence)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    confidence: percentToConfidence(event.target.value)
                  }))
                }
              />
              <span className="field-hint">
                How sure you are that this memory is accurate.
              </span>
            </FormField>
            <FormField label="Source">
              <SelectField
                ariaLabel="Memory source"
                value={draft.sourceType}
                options={sourceTypes.map((sourceType) => ({
                  label: label(sourceType),
                  value: sourceType
                }))}
                onValueChange={(sourceType) =>
                  setDraft((current) => ({
                    ...current,
                    sourceType: sourceType
                  }))
                }
              />
            </FormField>
            <FormField label="Source URI">
              <input
                type="url"
                value={draft.sourceUri}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sourceUri: event.target.value
                  }))
                }
              />
            </FormField>
          </div>
        ) : null}
        <fieldset>
          <legend>Categories</legend>
          <div className="category-options">
            {categories.map((category) => (
              <CheckboxField
                key={category.key}
                checked={draft.categoryKeys.includes(category.key)}
                onCheckedChange={() => toggleCategory(category.key)}
              >
                {category.name}
              </CheckboxField>
            ))}
          </div>
        </fieldset>
        <div className="form-actions">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : editorMode === "edit" ? "Save" : "Create"}
          </Button>
          <Button type="button" variant="secondary" onClick={cancelEditor}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
