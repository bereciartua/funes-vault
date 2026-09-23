import { Button } from "../../../components/ui/button";
import { CheckboxField } from "../../../components/ui/checkbox";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { PaginationControls } from "../../../components/ui/pagination";
import { label } from "../../../lib/domain/labels";
import { SettingsPane } from "../settings-scaffolding";
import { useDisclosureReviews } from "./use-disclosure-reviews";

export function DisclosureReviews() {
  const {
    id,
    setPage,
    list,
    preview,
    selected,
    setSelected,
    error,
    message,
    busy,
    decide,
    selectRequest,
    refresh
  } = useDisclosureReviews();

  return (
    <SettingsPane
      title="Sharing requests"
      description="Review the exact memory text an app wants to receive. Approval applies to this request only."
    >
      <FeedbackMessages error={error} />
      <FeedbackMessages message={message} />
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh requests
      </Button>
      <div className="disclosure-review-list">
        {list?.items.map((request) => (
          <button
            type="button"
            className="quiet-list-row"
            key={request.id}
            disabled={busy}
            aria-pressed={id === request.id}
            onClick={() => selectRequest(request.id)}
          >
            <strong>{request.clientName}</strong>
            <span>{request.task}</span>
          </button>
        ))}
        {list?.items.length === 0 ? (
          <p>No requests waiting for approval.</p>
        ) : null}
      </div>
      {list ? (
        <PaginationControls
          pagination={list.pagination}
          showPageSize={false}
          itemLabel="request"
          onPageChange={setPage}
          onLimitChange={() => {}}
          disabled={busy}
        />
      ) : null}
      {preview ? (
        <section
          className="disclosure-review-preview"
          aria-label="Disclosure preview"
        >
          <h2>Choose memories to share</h2>
          <dl className="memory-facts">
            <div>
              <dt>Requested by</dt>
              <dd>{preview.request.clientName}</dd>
            </div>
            <div>
              <dt>Task</dt>
              <dd>{preview.request.task}</dd>
            </div>
            <div>
              <dt>Purpose</dt>
              <dd>{preview.request.purpose}</dd>
            </div>
            <div>
              <dt>Declared retention</dt>
              <dd>
                {preview.request.retention.replaceAll("_", " ").toLowerCase()}
              </dd>
            </div>
            <div>
              <dt>Declared processors</dt>
              <dd>
                {preview.request.thirdPartyProcessors.join(", ") ||
                  "None declared"}
              </dd>
            </div>
          </dl>
          <p className="muted">
            These are the app’s declarations. Funes cannot control copies after
            disclosure.
          </p>
          {preview.items.map((item) => (
            <article className="suggestion-row" key={item.memoryId}>
              <CheckboxField
                checked={selected.includes(item.memoryId)}
                onCheckedChange={(checked) =>
                  setSelected((ids) =>
                    checked
                      ? [...ids, item.memoryId]
                      : ids.filter((id) => id !== item.memoryId)
                  )
                }
              >
                <span>{item.text}</span>
              </CheckboxField>
              <small>
                {label(item.sensitivity)} · {item.estimatedTokens} estimated
                tokens
              </small>
            </article>
          ))}
          {!preview.canApprove ? (
            <p>
              This request has already been reviewed or no memories are allowed
              by its current policy.
            </p>
          ) : null}
          <div className="disclosure-review-actions">
            <Button
              type="button"
              disabled={busy || !preview.canApprove || selected.length === 0}
              onClick={() => void decide("approve")}
            >
              Approve selected once
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={
                busy || preview.request.status !== "NEEDS_USER_APPROVAL"
              }
              onClick={() => void decide("deny")}
            >
              Deny request
            </Button>
          </div>
        </section>
      ) : null}
    </SettingsPane>
  );
}
