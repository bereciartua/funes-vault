"use client";
import Link from "next/link";

import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { formatDateTime } from "../../../lib/dates";
import { auditEventSummary } from "../../../lib/domain/audit-summary";
import { auditFacts } from "./audit-facts";
import { SubjectLinks } from "./SubjectLinks";
import { useAuditDetail } from "./use-audit";
export function AuditEventDetail({ eventId }: { eventId: string }) {
  const query = useAuditDetail(eventId);
  if (query.isPending) {
    return <p role="status">Loading audit event…</p>;
  }
  if (query.error || !query.data) {
    return <FeedbackMessages error="Could not load that audit event." />;
  }
  const event = query.data.auditEvent;
  const hasMetadata = Object.keys(event.metadata).length > 0;
  const summary = auditEventSummary(event);
  const facts = auditFacts(event);

  return (
    <div className="audit-inline-detail">
      <p className="audit-detail-title">
        <strong>{summary.title}</strong> {summary.description}
      </p>
      <p>{formatDateTime(event.createdAt)}</p>
      {event.actorType === "JOB" ? <p>Performed by the job runner.</p> : null}
      {event.actorType === "SYSTEM" ? (
        <p>Performed by the vault system.</p>
      ) : null}
      {event.actorType === "USER" ? <p>Performed by you.</p> : null}
      {event.clientName ? <p>Disclosed to {event.clientName}.</p> : null}
      {event.memoryRequestId ? (
        <p>
          <Link
            href={`/settings/requests?requestId=${encodeURIComponent(event.memoryRequestId)}`}
          >
            Disclosure request
          </Link>
        </p>
      ) : null}
      {event.subjects.length > 0 ? (
        <p>
          Subjects:{" "}
          <SubjectLinks leadingDash={false} subjects={event.subjects} />
        </p>
      ) : null}
      {facts.length ? (
        <dl>
          {facts.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {hasMetadata ? (
        <details className="raw-metadata">
          <summary>Raw metadata</summary>
          <pre className="json-block">
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
