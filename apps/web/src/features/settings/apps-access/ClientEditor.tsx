import { type MemoryCategory } from "@funes-vault/shared";

import { Button, DeleteButton } from "../../../components/ui/button";
import { FormField } from "../../../components/ui/form-field";
import { SelectField } from "../../../components/ui/select";
import { clientTypeLabel, label } from "../../../lib/domain/labels";
import { clientTypes, retentionLevels, trustLevels } from "./policy-draft";
import { PolicyList } from "./PolicyList";
import { TokenReveal } from "./TokenReveal";
import type { ClientWorkspace } from "./use-client-workspace";
export function ClientEditor({
  model,
  categories
}: {
  model: ClientWorkspace;
  categories: MemoryCategory[];
}) {
  const {
    clientMode,
    selectedClient,
    clientDraft,
    setClientDraft,
    token,
    copyToken,
    saveClient,
    isSaving,
    confirmRotateToken,
    confirmDeleteClient,
    cancelCreate
  } = model;
  const isExisting = clientMode === "edit" && selectedClient !== null;
  const clientFormId = `client-form-${selectedClient?.id ?? "new"}`;

  return (
    <div className="client-inline-editor" aria-label="App editor">
      {token ? <TokenReveal token={token} copyToken={copyToken} /> : null}

      {isExisting && selectedClient.oauthConnector ? (
        <p className="client-caveat">
          Connected via OAuth. Blocking or deleting this app revokes its access
          and refresh tokens immediately.
        </p>
      ) : null}

      <form
        id={clientFormId}
        className="form-stack client-editor-form"
        onSubmit={saveClient}
      >
        <div className="form-grid">
          <FormField label="Name">
            <input
              value={clientDraft.name}
              onChange={(event) =>
                setClientDraft((current) => ({
                  ...current,
                  name: event.target.value
                }))
              }
              required
            />
          </FormField>
          <FormField label="Type">
            <SelectField
              ariaLabel="App type"
              disabled={Boolean(isExisting && selectedClient.oauthConnector)}
              value={clientDraft.type}
              options={clientTypes.map((type) => ({
                label: clientTypeLabel(type),
                value: type
              }))}
              onValueChange={(type) =>
                setClientDraft((current) => ({
                  ...current,
                  type
                }))
              }
            />
          </FormField>
          <FormField label="Trust">
            <SelectField
              ariaLabel="App trust"
              value={clientDraft.trustLevel}
              options={trustLevels.map((trustLevel) => ({
                label: label(trustLevel),
                value: trustLevel
              }))}
              onValueChange={(trustLevel) =>
                setClientDraft((current) => ({
                  ...current,
                  trustLevel
                }))
              }
            />
          </FormField>
          <FormField label="Retention">
            <SelectField
              ariaLabel="App retention"
              value={clientDraft.declaredRetention}
              options={retentionLevels.map((retention) => ({
                label: label(retention),
                value: retention
              }))}
              onValueChange={(declaredRetention) =>
                setClientDraft((current) => ({
                  ...current,
                  declaredRetention
                }))
              }
            />
          </FormField>
        </div>

        {clientDraft.trustLevel === "UNKNOWN" ||
        clientDraft.trustLevel === "BLOCKED" ||
        clientDraft.declaredRetention === "PERSISTENT" ? (
          <p className="risk-sentence">
            This access state calls for a narrow policy before memory is
            disclosed.
          </p>
        ) : null}
      </form>

      {isExisting ? (
        <PolicyList client={selectedClient} categories={categories} />
      ) : (
        <p className="field-hint">
          Save the app first, then define which memories it can access.
        </p>
      )}

      <div className="client-editor-footer">
        <Button type="submit" form={clientFormId} disabled={isSaving}>
          {isSaving ? "Saving…" : isExisting ? "Save" : "Create"}
        </Button>
        {isExisting ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={() => void confirmRotateToken()}
          >
            Rotate token
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={cancelCreate}>
            Cancel
          </Button>
        )}
        <span className="client-editor-spacer" />
        {isExisting ? (
          <DeleteButton
            type="button"
            disabled={isSaving}
            onClick={() => void confirmDeleteClient()}
          />
        ) : null}
      </div>
    </div>
  );
}
