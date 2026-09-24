"use client";
import type {
  ProvenanceSubject,
  ReviewableMemorySuggestion
} from "@funes-vault/shared";
import Link from "next/link";

import { SubjectChips } from "../../../components/SubjectChips";
import { Button } from "../../../components/ui/button";
import { CheckboxField } from "../../../components/ui/checkbox";
import { DotBadge } from "../../../components/ui/dot-badge";
import { formatDate, formatRelative } from "../../../lib/dates";
import { label } from "../../../lib/domain/labels";
import { processorLabel } from "../../../lib/domain/processing";
import { subjectHref } from "../../../lib/domain/subject-links";
function consolidationSuggestionTitle(suggestion: ReviewableMemorySuggestion) {
  if (suggestion.source.type !== "CONSOLIDATION") {
    return suggestion.title;
  }

  const reason = suggestion.source.metadata.reason;
  const titleByReason: Record<string, string> = {
    exact_duplicate: "Archive duplicate",
    semantic_duplicate: "Archive duplicate",
    expired: "Archive expired memory",
    superseded: "Archive superseded memory",
    conflict: "Archive conflicting memory"
  };

  return typeof reason === "string"
    ? (titleByReason[reason] ?? "Archive memory")
    : "Archive memory";
}

function subjectFromSuggestionMetadata(
  suggestion: ReviewableMemorySuggestion,
  key: "target" | "canonical"
): ProvenanceSubject | null {
  const idKey = key === "target" ? "targetMemoryId" : "canonicalMemoryId";
  const titleKey = key === "target" ? "targetTitle" : "canonicalTitle";
  const id = suggestion.source.metadata[idKey];

  if (typeof id !== "string" || id.length === 0) {
    return null;
  }

  const title = suggestion.source.metadata[titleKey];

  return {
    type: "MEMORY",
    id,
    role: key === "target" ? "TARGET" : "CANONICAL",
    label: typeof title === "string" ? title : null,
    metadata: {},
    memoryStatus: null,
    memorySensitivity: null
  };
}

function consolidationSuggestionSubjects(
  suggestion: ReviewableMemorySuggestion
) {
  const typedSubjects = suggestion.source.subjects.filter((subject) =>
    ["TARGET", "CANONICAL", "SUPERSEDED_BY", "DUPLICATE_OF", "JOB"].includes(
      subject.role
    )
  );

  if (typedSubjects.length > 0) {
    return typedSubjects;
  }

  return [
    subjectFromSuggestionMetadata(suggestion, "target"),
    subjectFromSuggestionMetadata(suggestion, "canonical")
  ].filter((subject): subject is ProvenanceSubject => Boolean(subject));
}

function suggestionSource(suggestion: ReviewableMemorySuggestion) {
  if (suggestion.source.type === "CHAT") {
    return "From chat with Funes";
  }
  if (suggestion.source.type === "CONSOLIDATION") {
    return "From vault consolidation";
  }

  return `From ${label(suggestion.source.type).toLowerCase()}`;
}

export function SuggestionCard({
  suggestion,
  selected,
  duplicate,
  busy,
  onToggleSelected,
  onApply,
  onReject
}: {
  suggestion: ReviewableMemorySuggestion;
  selected: boolean;
  duplicate: boolean;
  busy: boolean;
  onToggleSelected: (id: string) => void;
  onApply: (id: string) => Promise<void>;
  onReject: (suggestion: ReviewableMemorySuggestion) => Promise<void>;
}) {
  const subjects = consolidationSuggestionSubjects(suggestion);
  const isConsolidation = suggestion.source.type === "CONSOLIDATION";

  return (
    <article className="suggestion-row" data-selected={selected}>
      <div>
        <div className="suggestion-title-row">
          <CheckboxField
            checked={selected}
            className="suggestion-select"
            onCheckedChange={() => onToggleSelected(suggestion.id)}
          >
            <strong>{consolidationSuggestionTitle(suggestion)}</strong>
          </CheckboxField>
          {duplicate ? (
            <span className="suggestion-duplicate">Duplicate</span>
          ) : null}
          <time dateTime={suggestion.createdAt}>
            {formatRelative(suggestion.createdAt)}
          </time>
        </div>
        <p className="suggestion-source">{suggestionSource(suggestion)}</p>
        <p>{suggestion.body}</p>
        <dl className="memory-facts">
          <div>
            <dt>Stated purpose</dt>
            <dd>{suggestion.statedPurpose ?? "Not provided"}</dd>
          </div>
          <div>
            <dt>App permissions</dt>
            <dd>
              {suggestion.policyId ? (
                <Link href="/settings/clients">Permissions when proposed</Link>
              ) : (
                "Not provided"
              )}
            </dd>
          </div>
        </dl>
        {subjects.length > 0 ? <SubjectChips subjects={subjects} /> : null}
        {suggestion.source.metadata.caller &&
        typeof suggestion.source.metadata.caller === "object" &&
        Object.keys(suggestion.source.metadata.caller).length > 0 ? (
          <details>
            <summary>Caller metadata</summary>
            <pre>
              {JSON.stringify(suggestion.source.metadata.caller, null, 2)}
            </pre>
          </details>
        ) : null}
        {Array.isArray(suggestion.source.metadata?.processors) ? (
          <p className="suggestion-evidence">
            Processed by{" "}
            {suggestion.source.metadata.processors
              .map((processor: unknown) =>
                typeof processor === "string"
                  ? processorLabel(processor)
                  : "Unknown processor"
              )
              .join(" + ")}
          </p>
        ) : null}
        {suggestion.evidence ? (
          <p className="suggestion-evidence">
            <strong>Why:</strong> {suggestion.evidence}
          </p>
        ) : null}
        {isConsolidation ? (
          <p className="suggestion-effect">
            Applying this will archive the target memory and keep the canonical
            memory active.
          </p>
        ) : null}
        <div className="suggestion-meta">
          <DotBadge kind="sensitivity" value={suggestion.sensitivity} />
          <span>{label(suggestion.kind)}</span>
          <span>
            {suggestion.categoryKeys.map(label).join(", ") || "Uncategorized"}
          </span>
        </div>
        <small>
          {Math.round(suggestion.confidence * 100)}% confidence
          {suggestion.expiresAt
            ? ` · Expires ${formatDate(suggestion.expiresAt)}`
            : ""}
        </small>
      </div>
      <div className="suggestion-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void onApply(suggestion.id)}
        >
          {isConsolidation ? consolidationSuggestionTitle(suggestion) : "Apply"}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() => void onReject(suggestion)}
        >
          {isConsolidation ? "Keep both" : "Reject"}
        </Button>
        {subjects[0] && subjectHref(subjects[0]) ? (
          <Button asChild type="button" variant="secondary">
            <Link href={subjectHref(subjects[0])!}>
              {isConsolidation ? "Compare" : "Open in context"}
            </Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
