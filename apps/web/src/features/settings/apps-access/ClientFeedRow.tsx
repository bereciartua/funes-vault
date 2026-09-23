import type { Client, MemoryCategory } from "@funes-vault/shared";

import { Button } from "../../../components/ui/button";
import { DotBadge } from "../../../components/ui/dot-badge";
import { formatRelative } from "../../../lib/dates";
import { clientAccessSummary } from "../../../lib/domain/policy-summary";
import { ClientEditor } from "./ClientEditor";
import type { ClientWorkspace } from "./use-client-workspace";
export function ClientFeedRow({
  client,
  model,
  categories
}: {
  client: Client;
  model: ClientWorkspace;
  categories: MemoryCategory[];
}) {
  const {
    selectedClientId,
    clientMode,
    selectClient,
    isSaving,
    updateClientTrust
  } = model;
  const expanded = selectedClientId === client.id && clientMode === "edit";
  const policy = client.policySummary ?? null;
  const summary =
    client.trustLevel === "UNKNOWN"
      ? `Requested access ${formatRelative(client.createdAt)} · held until you decide`
      : client.trustLevel === "BLOCKED"
        ? "Access blocked · tokens revoked"
        : `${clientAccessSummary(client, policy)}${client.oauthConnector ? " · connected via OAuth" : ""}`;

  return (
    <article
      key={client.id}
      className="client-feed-row"
      data-expanded={expanded}
    >
      <div className="client-row-line">
        <DotBadge kind="trust" value={client.trustLevel} />
        <strong title={client.name}>{client.name}</strong>
        <div className="client-row-actions">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-controls={`client-${client.id}-editor`}
            aria-expanded={expanded}
            onClick={() => selectClient(client)}
          >
            {expanded ? "Close" : "Edit"}
          </Button>
          {client.trustLevel === "UNKNOWN" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isSaving}
                onClick={() => void updateClientTrust(client, "APPROVED")}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={isSaving}
                onClick={() => void updateClientTrust(client, "BLOCKED")}
              >
                Block
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isSaving}
              onClick={() =>
                void updateClientTrust(
                  client,
                  client.trustLevel === "BLOCKED" ? "APPROVED" : "BLOCKED"
                )
              }
            >
              {client.trustLevel === "BLOCKED" ? "Unblock" : "Revoke"}
            </Button>
          )}
        </div>
      </div>
      <p className="client-row-prose">{summary}</p>
      {expanded ? (
        <div id={`client-${client.id}-editor`}>
          {<ClientEditor model={model} categories={categories} />}
        </div>
      ) : null}
    </article>
  );
}
