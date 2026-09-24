"use client";
import { type Client, type Policy } from "@funes-vault/shared";
import { type FormEvent, useState } from "react";

import { useConfirm } from "../../../components/ui/confirmation-dialog";
import { apiErrorMessage } from "../../../lib/api/api-client";
import { toExpiresAtIso } from "../../../lib/dates";
import {
  emptyPolicyDraft,
  type PolicyDraft,
  type PolicyEditorState,
  toPolicyDraft
} from "./policy-draft";
import { usePolicies } from "./use-policies";
import { usePolicyMutations } from "./use-policy-mutations";
export function usePolicyWorkspace(client: Client) {
  const query = usePolicies(client.id);
  const policies = query.data?.items ?? [];
  const [policyEditor, setPolicyEditor] = useState<PolicyEditorState>(null);
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft>(emptyPolicyDraft);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const mutations = usePolicyMutations();
  const draftPolicy: Policy = {
    ...policyDraft,
    id: policyEditor?.mode === "edit" ? policyEditor.policyId : "draft-policy",
    clientId: client.id,
    clientName: client.name,
    expiresAt: toExpiresAtIso(policyDraft.expiresAt),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
  function startPolicyCreate() {
    setPolicyDraft(emptyPolicyDraft);
    setPolicyEditor({ mode: "create" });
    setMessage(null);
    setError(null);
  }
  function togglePolicyEditor(policy: Policy) {
    setMessage(null);
    setError(null);
    if (policyEditor?.mode === "edit" && policyEditor.policyId === policy.id) {
      setPolicyEditor(null);

      return;
    }
    setPolicyDraft(toPolicyDraft(policy));
    setPolicyEditor({ mode: "edit", policyId: policy.id });
  }
  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policyEditor) {
      return;
    }
    setMessage(null);
    setError(null);
    const id = policyEditor.mode === "edit" ? policyEditor.policyId : null;
    const draft = {
      ...policyDraft,
      expiresAt: toExpiresAtIso(policyDraft.expiresAt)
    };
    try {
      if (id) {
        await mutations.update.mutateAsync({ id, draft });
      } else {
        await mutations.create.mutateAsync({ ...draft, clientId: client.id });
      }
      setPolicyEditor(null);
      setMessage(id ? "Permissions updated." : "Permissions created.");
    } catch (error) {
      setError(apiErrorMessage(error, "Could not save these permissions."));
      await query.refetch();
    }
  }
  async function confirmDeletePolicy(policy: Policy) {
    if (
      !(await confirm({
        title: "Remove permissions?",
        body: `Remove permissions for ${client.name}. Future requests will be denied until permissions are set up again.`,
        confirmLabel: "Remove permissions",
        tone: "danger"
      }))
    ) {
      return;
    }
    setMessage(null);
    setError(null);
    try {
      await mutations.remove.mutateAsync(policy.id);
      setPolicyEditor(null);
      setMessage("Permissions removed.");
    } catch (error) {
      setError(apiErrorMessage(error, "Could not delete this policy."));
    }
  }

  async function restoreDefaults() {
    try {
      await mutations.restore.mutateAsync(client.id);
      setMessage("Default permissions restored.");
    } catch (error) {
      setError(apiErrorMessage(error, "Could not restore permissions."));
      await query.refetch();
    }
  }

  return {
    isFirstParty:
      client.type === "WEB_APP" &&
      ["Funes Vault Web Chat", "Funes Vault Voice"].includes(client.name),
    restoreDefaults,
    policies,
    policyEditor,
    setPolicyEditor,
    policyDraft,
    setPolicyDraft,
    draftPolicy,
    startPolicyCreate,
    togglePolicyEditor,
    savePolicy,
    confirmDeletePolicy,
    isSaving: mutations.isPending,
    message,
    error:
      error ??
      (query.error
        ? apiErrorMessage(
            query.error,
            "Could not load the policies for this app."
          )
        : null)
  };
}
export type PolicyWorkspace = ReturnType<typeof usePolicyWorkspace>;
