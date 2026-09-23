import { type MemoryCategory } from "@funes-vault/shared";

import { Button } from "../../../components/ui/button";
import { DotBadge } from "../../../components/ui/dot-badge";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { PaginationControls } from "../../../components/ui/pagination";
import { pluralize } from "../../../lib/text";
import { SettingsPane } from "../settings-scaffolding";
import { ClientEditor } from "./ClientEditor";
import { ClientFeedRow } from "./ClientFeedRow";
import { ConnectAgentGuide } from "./ConnectAgentGuide";
import { useClientWorkspace } from "./use-client-workspace";
export function AppsAccessPanel({
  categories
}: {
  categories: MemoryCategory[];
}) {
  const model = useClientWorkspace();
  const {
    clientPagination,
    clientMode,
    message,
    error,
    startClientCreate,
    clientDraft,
    sortedClients,
    changeClientLimit,
    changeClientPage
  } = model;

  return (
    <SettingsPane
      title="Apps & access"
      description={`${pluralize(clientPagination.total, "connected app")} can request only the memory its policy allows.`}
    >
      {message || error ? (
        <div className="status-stack" aria-live="polite">
          <FeedbackMessages message={message} />
          <FeedbackMessages error={error} />
        </div>
      ) : null}

      <ConnectAgentGuide defaultOpen={clientPagination.total === 0} />
      {clientPagination.total === 0 && clientMode !== "create" ? (
        <p className="settings-empty">
          No apps yet. Connect one to start sharing memory on your terms.
        </p>
      ) : null}

      <section className="client-feed" aria-label="Connected apps">
        <div className="settings-section-heading">
          <p className="eyebrow">Connected apps · {clientPagination.total}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={startClientCreate}
          >
            + New app
          </Button>
        </div>

        {clientMode === "create" ? (
          <article className="client-feed-row" data-expanded="true">
            <div className="client-row-line">
              <DotBadge kind="trust" value={clientDraft.trustLevel} />
              <strong>New app</strong>
            </div>
            {<ClientEditor model={model} categories={categories} />}
          </article>
        ) : null}

        <div className="client-feed-list">
          {sortedClients.map((client) => (
            <ClientFeedRow
              key={client.id}
              client={client}
              model={model}
              categories={categories}
            />
          ))}
        </div>

        {clientPagination.total > clientPagination.limit ? (
          <PaginationControls
            itemLabel="app"
            pagination={clientPagination}
            variant="compact"
            onLimitChange={changeClientLimit}
            onPageChange={changeClientPage}
          />
        ) : null}
      </section>
    </SettingsPane>
  );
}
