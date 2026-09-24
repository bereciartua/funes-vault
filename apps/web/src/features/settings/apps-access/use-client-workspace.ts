"use client";
import { type Client } from "@funes-vault/shared";
import { type FormEvent, useState } from "react";

import { useConfirm } from "../../../components/ui/confirmation-dialog";
import { emptyPagination } from "../../../components/ui/pagination";
import { apiErrorMessage } from "../../../lib/api/api-client";
import {
  type ClientDraft,
  type EditorMode,
  emptyClientDraft,
  toClientDraft
} from "./policy-draft";
import { useClientMutations } from "./use-client-mutations";
import { useClients } from "./use-clients";
export function useClientWorkspace() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const query = useClients(page, limit);
  const clients = query.data?.items ?? [];
  const clientPagination = query.data?.pagination ?? {
    ...emptyPagination(),
    page,
    limit
  };
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ?? null;
  const [clientMode, setClientMode] = useState<EditorMode>("edit");
  const [clientDraft, setClientDraft] = useState<ClientDraft>(emptyClientDraft);
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const mutations = useClientMutations();
  const sortedClients = [...clients].sort((left, right) => {
    const rank = { UNKNOWN: 0, APPROVED: 1, BLOCKED: 2 };

    return rank[left.trustLevel] - rank[right.trustLevel];
  });
  function clearFeedback() {
    setMessage(null);
    setError(null);
  }
  function selectClient(client: Client) {
    const closing = selectedClientId === client.id && clientMode === "edit";
    setSelectedClientId(closing ? null : client.id);
    setClientDraft(closing ? emptyClientDraft : toClientDraft(client));
    setClientMode("edit");
    setToken(null);
    clearFeedback();
  }
  function startClientCreate() {
    setSelectedClientId(null);
    setClientDraft(emptyClientDraft);
    setClientMode("create");
    setToken(null);
    clearFeedback();
  }
  function cancelCreate() {
    setClientMode("edit");
    setClientDraft(emptyClientDraft);
    setToken(null);
  }
  function applyClient(client: Client, nextToken?: string) {
    setSelectedClientId(client.id);
    setClientDraft(toClientDraft(client));
    setClientMode("edit");
    setToken(nextToken ?? null);
    setPage(1);
  }
  async function copyToken() {
    if (!token) {
      return;
    }
    try {
      await navigator.clipboard.writeText(token);
      setMessage("Token copied.");
    } catch {
      setError("Could not copy the token. Select and copy it manually.");
    }
  }
  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    try {
      const parsed = selectedClientId
        ? await mutations.update.mutateAsync({
            id: selectedClientId,
            draft: clientDraft
          })
        : await mutations.create.mutateAsync(clientDraft);
      applyClient(parsed.client, parsed.token);
      setMessage(selectedClientId ? "App updated." : "App created.");
    } catch (error) {
      setError(apiErrorMessage(error, "Could not save this app."));
    }
  }
  async function confirmRotateToken() {
    if (
      !selectedClient ||
      !(await confirm({
        title: "Rotate client token?",
        body: `Rotate the token for "${selectedClient.name}". The current token will stop working for any app still using it.`,
        confirmLabel: "Rotate token",
        tone: "danger"
      }))
    ) {
      return;
    }
    clearFeedback();
    try {
      const parsed = await mutations.update.mutateAsync({
        id: selectedClient.id,
        draft: { rotateToken: true }
      });
      applyClient(parsed.client, parsed.token);
      setMessage("Token rotated.");
    } catch (error) {
      setError(apiErrorMessage(error, "Could not rotate this token."));
    }
  }
  async function confirmDeleteClient() {
    if (!selectedClient) {
      return;
    }
    const policyNote = selectedClient.hasPolicy
      ? " Its app permissions will be removed too."
      : "";
    if (
      !(await confirm({
        title: "Delete app?",
        body: `Delete "${selectedClient.name}" and remove its access configuration.${policyNote} Apps using this client will no longer be able to connect.`,
        confirmLabel: "Delete app",
        tone: "danger"
      }))
    ) {
      return;
    }
    clearFeedback();
    try {
      await mutations.remove.mutateAsync(selectedClient.id);
      setSelectedClientId(null);
      cancelCreate();
      if (clients.length === 1 && page > 1) {
        setPage(page - 1);
      }
      setMessage("App deleted.");
    } catch (error) {
      setError(apiErrorMessage(error, "Could not delete this app."));
    }
  }
  async function updateClientTrust(
    client: Client,
    trustLevel: Client["trustLevel"]
  ) {
    clearFeedback();
    try {
      const parsed = await mutations.update.mutateAsync({
        id: client.id,
        draft: { trustLevel }
      });
      applyClient(parsed.client);
      setMessage(
        trustLevel === "APPROVED" ? "App approved." : "App access blocked."
      );
    } catch (error) {
      setError(apiErrorMessage(error, "Could not update app access."));
    }
  }

  return {
    clientPagination,
    selectedClientId,
    selectedClient,
    clientMode,
    clientDraft,
    setClientDraft,
    token,
    message,
    error:
      error ??
      (query.error
        ? apiErrorMessage(query.error, "Could not load apps and access.")
        : null),
    sortedClients,
    isSaving: mutations.isPending,
    selectClient,
    startClientCreate,
    cancelCreate,
    copyToken,
    saveClient,
    confirmRotateToken,
    confirmDeleteClient,
    updateClientTrust,
    changeClientPage: setPage,
    changeClientLimit: (next: number) => {
      setLimit(next);
      setPage(1);
    }
  };
}
export type ClientWorkspace = ReturnType<typeof useClientWorkspace>;
