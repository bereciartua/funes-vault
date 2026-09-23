"use client";
import { type AuditEvent, type ClientOption } from "@funes-vault/shared";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "../../../components/ui/button";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { FormField } from "../../../components/ui/form-field";
import {
  emptyPagination,
  PaginationControls
} from "../../../components/ui/pagination";
import { SelectField } from "../../../components/ui/select";
import { feedTime } from "../../../lib/dates";
import { auditEventSummary } from "../../../lib/domain/audit-summary";
import { label } from "../../../lib/domain/labels";
import { FeedRow, type FeedTone, SettingsPane } from "../settings-scaffolding";
import { AuditEventDetail } from "./AuditEventDetail";
import { SubjectLinks } from "./SubjectLinks";
import { useAudit } from "./use-audit";

const auditEventTypes: AuditEvent["type"][] = [
  "MEMORY_CREATED",
  "MEMORY_UPDATED",
  "MEMORY_ARCHIVED",
  "MEMORY_DELETED",
  "MEMORY_DISCLOSURE",
  "MEMORY_SUGGESTION_CREATED",
  "MEMORY_SUGGESTION_APPROVED",
  "MEMORY_SUGGESTION_REJECTED",
  "CLIENT_CREATED",
  "CLIENT_UPDATED",
  "CLIENT_TOKEN_ROTATED",
  "POLICY_CREATED",
  "POLICY_UPDATED",
  "POLICY_DELETED",
  "JOB_CREATED",
  "JOB_COMPLETED",
  "JOB_FAILED"
];

function clientOptionLabel(client: ClientOption) {
  return client.trustLevel === "APPROVED"
    ? client.name
    : `${client.name} · ${label(client.trustLevel)}`;
}

function auditTone(event: AuditEvent): FeedTone {
  const tone = auditEventSummary(event).tone;
  if (tone === "danger" || tone === "blocked") {
    return "danger";
  }
  if (tone === "attention" || tone === "risk") {
    return "warn";
  }

  return "brand";
}

export function AuditPanel() {
  const linkedEventId = useSearchParams().get("eventId");
  const [auditPagination, setAuditPagination] = useState(() =>
    emptyPagination()
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [auditTypeFilter, setAuditTypeFilter] = useState("");
  const [auditClientFilter, setAuditClientFilter] = useState("");
  const filters = {
    page: auditPagination.page,
    limit: auditPagination.limit,
    type: auditTypeFilter,
    clientId: auditClientFilter
  };
  const { events, clients } = useAudit(filters);
  const auditEvents = events.data?.items ?? [];
  const clientOptions = clients.data?.items ?? [];
  const pagination = events.data?.pagination ?? auditPagination;
  const error =
    events.error || clients.error ? "Could not load audit events." : null;
  function toggleAuditEvent(event: AuditEvent) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(event.id)) {
        next.delete(event.id);
      } else {
        next.add(event.id);
      }

      return next;
    });
  }
  function clearFilters() {
    setAuditTypeFilter("");
    setAuditClientFilter("");
    setAuditPagination((current) => ({ ...current, page: 1 }));
  }

  return (
    <SettingsPane
      title="Audit log"
      description="A readable record of changes, disclosures, and background activity."
    >
      <FeedbackMessages error={error} />
      {linkedEventId ? (
        <section aria-label="Linked audit event">
          <h2>Audit event</h2>
          <AuditEventDetail eventId={linkedEventId} />
        </section>
      ) : null}
      <form
        className="audit-filters"
        onSubmit={(event) => event.preventDefault()}
      >
        <FormField label="Event">
          <SelectField
            ariaLabel="Audit event filter"
            value={auditTypeFilter}
            options={[
              { label: "All events", value: "" },
              ...auditEventTypes.map((eventType) => ({
                label: label(eventType),
                value: eventType
              }))
            ]}
            onValueChange={(type) => {
              setAuditTypeFilter(type);
              setAuditPagination((current) => ({ ...current, page: 1 }));
            }}
          />
        </FormField>
        <FormField label="Client">
          <SelectField
            ariaLabel="Audit client filter"
            value={auditClientFilter}
            options={[
              { label: "All actors", value: "" },
              ...clientOptions.map((client) => ({
                label: clientOptionLabel(client),
                value: client.id
              }))
            ]}
            onValueChange={(clientId) => {
              setAuditClientFilter(clientId);
              setAuditPagination((current) => ({ ...current, page: 1 }));
            }}
          />
        </FormField>
      </form>

      <div className="settings-section-heading">
        <p className="eyebrow">{pagination.total} events</p>
        <PaginationControls
          itemLabel="audit event"
          nextLabel="Older"
          pagination={pagination}
          previousLabel="Newer"
          variant="stream"
          onLimitChange={(limit) =>
            setAuditPagination((current) => ({ ...current, limit, page: 1 }))
          }
          onPageChange={(page) =>
            setAuditPagination((current) => ({ ...current, page }))
          }
        />
      </div>

      {pagination.total === 0 ? (
        <div className="settings-empty">
          <p>No events match these filters.</p>
          {auditTypeFilter || auditClientFilter ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="feed-list audit-feed">
        {auditEvents.map((event) => {
          const summary = auditEventSummary(event);

          return (
            <FeedRow
              key={event.id}
              id={`audit-${event.id}`}
              time={feedTime(event.createdAt)}
              tone={auditTone(event)}
              expanded={expandedIds.has(event.id)}
              onToggle={() => void toggleAuditEvent(event)}
              details={<AuditEventDetail eventId={event.id} />}
            >
              <strong>{summary.title}</strong> {summary.description}
              <SubjectLinks subjects={event.subjects} />
            </FeedRow>
          );
        })}
      </div>
    </SettingsPane>
  );
}
