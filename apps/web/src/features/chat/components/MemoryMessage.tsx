"use client";
import { type FunesDataParts } from "@funes-vault/shared";
import { ChevronDown, Mic } from "lucide-react";

import { DotBadge } from "../../../components/ui/dot-badge";
import { formatChatTimestamp } from "../../../lib/dates";
import { label } from "../../../lib/domain/labels";
import { routes } from "../../../lib/routes";
import { pluralize } from "../../../lib/text";
import { dataParts } from "../message-parts";
import { FunesUIMessage } from "../types";
import { MemoryMarkdown } from "./MemoryMarkdown";
import { MemoryProcessingOutcome } from "./MemoryProcessingOutcome";
function disclosureSummary(policy?: FunesDataParts["policy-decision"]) {
  if (!policy || policy.decision === "ALLOW") {
    return "read in full";
  }
  if (policy.decision === "REQUIRE_CONFIRMATION") {
    return "summary only, per policy";
  }

  return "not disclosed";
}
export function MemoryMessage({
  message,
  onOpenInbox,
  onOpenMemory
}: {
  message: FunesUIMessage;
  onOpenInbox: () => void;
  onOpenMemory: (memoryId: string) => Promise<void>;
}) {
  const citations = dataParts(message, "memory-citation").map(
    (part) => part.data
  );
  const suggestions = dataParts(message, "memory-suggestion").map(
    (part) => part.data
  );
  const toolTraces = dataParts(message, "tool-trace").map((part) => part.data);
  const policies = dataParts(message, "policy-decision").map(
    (part) => part.data
  );
  const auditEvents = dataParts(message, "audit-event").map(
    (part) => part.data
  );
  const timestamp = formatChatTimestamp(message.metadata?.createdAt);

  return (
    <article className={`memory-message memory-message--${message.role}`}>
      <div className="memory-message-meta">
        <strong>{message.role === "user" ? "You" : "FUNES"}</strong>
        {message.metadata?.provider?.channel === "voice" ? (
          <span className="voice-turn-badge" title="Spoken in a voice session">
            <Mic aria-hidden="true" size={12} strokeWidth={2.6} />
            Voice
          </span>
        ) : null}
        {timestamp ? (
          <time dateTime={message.metadata?.createdAt}>{timestamp}</time>
        ) : null}
        {message.role === "assistant" && citations.length > 0 ? (
          <span>answered from your vault</span>
        ) : null}
      </div>
      {message.parts.map((part, index) =>
        part.type === "text" && part.text ? (
          <MemoryMarkdown
            key={`${message.id}-text-${index}`}
            text={part.text}
            citations={citations}
            onOpenMemory={onOpenMemory}
          />
        ) : null
      )}
      <MemoryProcessingOutcome initial={message.metadata?.processing} />
      {toolTraces.some(
        (trace) => trace.metadata?.reason === "no_client_policy"
      ) ? (
        <p>
          This app has no permissions.{" "}
          <a href="/settings/clients">Manage App permissions</a>
        </p>
      ) : null}
      {citations.length > 0 ? (
        <details className="message-evidence">
          <summary>
            <span className="eyebrow">Evidence</span>
            <span>{pluralize(citations.length, "memory", "memories")}</span>
            <ChevronDown
              className="message-evidence-chevron"
              aria-hidden="true"
              size={16}
              strokeWidth={2.5}
            />
          </summary>
          <div className="message-evidence-content">
            <ol>
              {citations.map((citation) => (
                <li key={citation.memoryId}>
                  <a
                    href={routes.memory(citation.memoryId)}
                    onClick={(event) => {
                      event.preventDefault();
                      void onOpenMemory(citation.memoryId);
                    }}
                  >
                    <span>{citation.ref}</span>
                    <DotBadge
                      kind="sensitivity"
                      value={citation.sensitivity}
                      showLabel={false}
                    />
                    <strong>{citation.title}</strong>
                  </a>
                  <small>{disclosureSummary(policies.at(-1))}</small>
                </li>
              ))}
            </ol>
            {toolTraces.length > 0 ||
            policies.length > 0 ||
            auditEvents.length > 0 ? (
              <details className="show-the-work">
                <summary>Show the work</summary>
                {toolTraces.map((trace) => (
                  <p key={trace.toolCallId}>
                    <b>{trace.label}</b> · {trace.summary}
                  </p>
                ))}
                {policies.map((policy, index) => (
                  <p key={`${policy.operation}-${index}`}>
                    <b>Policy</b> · {label(policy.operation)}{" "}
                    {label(policy.decision)}
                  </p>
                ))}
                {auditEvents.map((event) => (
                  <p key={event.auditEventId}>
                    <b>Audit</b> · {label(event.type)}
                  </p>
                ))}
              </details>
            ) : null}
          </div>
        </details>
      ) : null}
      {suggestions.some(
        (suggestion) => suggestion.status === "QUEUED_FOR_REVIEW"
      ) ? (
        <button
          type="button"
          className="suggestion-queued-link"
          onClick={onOpenInbox}
        >
          Review queued suggestion
        </button>
      ) : null}
    </article>
  );
}
