import type { MemoryProvenanceResponse } from "@funes-vault/shared";

import { SubjectChips } from "../../../components/SubjectChips";
import { formatDateTime } from "../../../lib/dates";
import { label } from "../../../lib/domain/labels";

function provenanceEventTitle(type: string) {
  const titles: Record<string, string> = {
    CREATED: "Created",
    IMPORTED: "Imported",
    SUGGESTED: "Suggestion applied",
    SOURCE_UPDATED: "Source updated",
    CONTENT_UPDATED: "Content updated",
    STATUS_CHANGED: "Status changed",
    ARCHIVED: "Archived",
    RESTORED: "Restored",
    DELETED: "Deleted",
    CONSOLIDATION_SUGGESTED: "Consolidation suggested",
    CONSOLIDATION_APPLIED: "Consolidation applied",
    DERIVED: "Derived"
  };

  return titles[type] ?? label(type);
}

export function MemoryProvenancePanel({
  isLoading,
  provenance
}: {
  isLoading: boolean;
  provenance: MemoryProvenanceResponse | null;
}) {
  const entries = provenance?.entries ?? [];
  const original = entries[0] ?? null;
  const latest = entries.length > 0 ? entries[entries.length - 1] : null;

  return (
    <section className="provenance-panel" aria-label="Memory provenance">
      <div className="provenance-heading">
        <div>
          <p className="eyebrow">Provenance</p>
          <h3>Origin and changes</h3>
        </div>
        {isLoading ? <span className="muted">Loading...</span> : null}
      </div>
      {original && entries.length > 1 ? (
        <div className="provenance-summary">
          <div>
            <span>Original</span>
            <strong>{provenanceEventTitle(original.type)}</strong>
            <small>
              {original.sourceType ? label(original.sourceType) : "Unknown"} ·{" "}
              {formatDateTime(original.createdAt)}
            </small>
          </div>
          {latest && latest.id !== original.id ? (
            <div>
              <span>Latest</span>
              <strong>{provenanceEventTitle(latest.type)}</strong>
              <small>{formatDateTime(latest.createdAt)}</small>
            </div>
          ) : null}
        </div>
      ) : !original && !isLoading ? (
        <p className="muted">No provenance entries have been recorded yet.</p>
      ) : null}
      {entries.length > 0 ? (
        <ol className="provenance-timeline">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="provenance-event">
                <div>
                  <strong>{provenanceEventTitle(entry.type)}</strong>
                  <small>
                    {label(entry.actorType)}
                    {entry.reason ? ` · ${label(entry.reason)}` : ""} ·{" "}
                    {formatDateTime(entry.createdAt)}
                  </small>
                </div>
                {entry.confidence !== null ? (
                  <span>{Math.round(entry.confidence * 100)}%</span>
                ) : null}
              </div>
              {entry.evidence ? <p>{entry.evidence}</p> : null}
              <SubjectChips
                subjects={entry.subjects.map((subject) =>
                  subject.type === "AUDIT_EVENT"
                    ? { ...subject, label: "Audit event" }
                    : subject
                )}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
