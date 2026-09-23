import type { ReactNode } from "react";

export function SettingsPane({
  children,
  description,
  title
}: {
  children: ReactNode;
  description: ReactNode;
  title: string;
}) {
  return (
    <section className="settings-pane">
      <header className="settings-pane-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

export type FeedTone = "brand" | "warn" | "danger";

export function FeedRow({
  children,
  details,
  expanded = false,
  id,
  onToggle,
  time,
  tone
}: {
  children: ReactNode;
  details?: ReactNode;
  expanded?: boolean;
  id: string;
  onToggle?: () => void;
  time: string;
  tone: FeedTone;
}) {
  return (
    <article className="feed-row">
      <div className="feed-row-line">
        <time>{time}</time>
        <i className="feed-dot" data-tone={tone} aria-hidden="true" />
        <span className="feed-sentence">{children}</span>
        {details && onToggle ? (
          <button
            type="button"
            className="feed-expand"
            aria-controls={`${id}-details`}
            aria-expanded={expanded}
            onClick={onToggle}
          >
            {expanded ? "Close" : "Details"}
          </button>
        ) : null}
      </div>
      {details && expanded ? (
        <div className="feed-row-details" id={`${id}-details`}>
          {details}
        </div>
      ) : null}
    </article>
  );
}
