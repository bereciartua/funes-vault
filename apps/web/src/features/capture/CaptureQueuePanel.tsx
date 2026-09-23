"use client";
import "./capture.css";

import { RefreshCw, Send, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button, IconButton } from "../../components/ui/button";
import { FormField } from "../../components/ui/form-field";
import { StatusBadge } from "../../components/ui/status-badge";
import type { BadgeDescriptor } from "../../lib/badge-types";
import { pluralize } from "../../lib/text";
import type { QueuedCapture, SyncOutcome } from "./capture-queue";
import { useCaptureQueue } from "./use-capture-queue";

export function captureStatusDescriptor(
  capture: QueuedCapture
): BadgeDescriptor {
  if (capture.status === "synced") {
    return {
      icon: "CircleCheck",
      label: "Synced for review",
      tone: "safe" as const
    };
  }

  if (capture.status === "failed") {
    return {
      icon: "OctagonAlert",
      label: "Rejected",
      tone: "danger" as const
    };
  }

  return {
    icon: "Clock3",
    label: "Waiting to sync",
    tone: "attention" as const
  };
}

function formatCaptureTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function CaptureQueueList({
  captures,
  onRemove
}: {
  captures: QueuedCapture[];
  onRemove: (captureId: string) => void;
}) {
  if (captures.length === 0) {
    return <p className="muted">No captures on this device.</p>;
  }

  return (
    <ul className="capture-list" aria-label="Capture queue">
      {captures.map((capture) => (
        <li key={capture.captureId} className="capture-row">
          <div className="capture-row-main">
            <p className="capture-row-text">{capture.text}</p>
            <div className="capture-row-meta">
              <StatusBadge descriptor={captureStatusDescriptor(capture)} />
              <small>{formatCaptureTime(capture.capturedAt)}</small>
            </div>
            {capture.error && capture.status !== "synced" ? (
              <p className="capture-row-error">{capture.error}</p>
            ) : null}
          </div>
          <IconButton
            type="button"
            label="Remove capture from this device"
            title="Remove"
            variant="secondary"
            onClick={() => onRemove(capture.captureId)}
          >
            <Trash2 aria-hidden="true" size={16} strokeWidth={2.4} />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

export function CaptureQueuePanel({
  onSynced
}: {
  onSynced?: (outcome: SyncOutcome) => void;
}) {
  const queue = useCaptureQueue({ onSynced });

  return <CaptureQueuePanelView queue={queue} />;
}

export function CaptureQueuePanelView({
  queue
}: {
  queue: ReturnType<typeof useCaptureQueue>;
}) {
  const [text, setText] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    setText("");
    await queue.addCapture(trimmed);
  }

  return (
    <section className="capture-panel" aria-label="Quick capture">
      <div className="capture-panel-heading">
        <div>
          <p className="eyebrow">Quick capture</p>
          <h2>Remember this</h2>
        </div>
        {queue.summary.pending > 0 ? (
          <StatusBadge
            descriptor={{
              icon: "Clock3",
              label: pluralize(queue.summary.pending, "pending capture"),
              tone: "attention"
            }}
          />
        ) : null}
      </div>
      <p className="capture-panel-note">
        Captures are stored on this device and sync to your vault as reviewable
        suggestions when it is reachable.
      </p>
      <form className="capture-form" onSubmit={submit}>
        <FormField label="Capture">
          <textarea
            value={text}
            rows={3}
            maxLength={10000}
            placeholder="Note something to remember..."
            onChange={(event) => setText(event.target.value)}
            required
          />
        </FormField>
        <div className="capture-form-actions">
          <Button type="submit" disabled={!text.trim()}>
            <Send aria-hidden="true" size={16} strokeWidth={2.5} />
            Queue capture
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={queue.isSyncing || queue.summary.pending === 0}
            onClick={() => void queue.sync()}
          >
            <RefreshCw aria-hidden="true" size={16} strokeWidth={2.5} />
            {queue.isSyncing ? "Syncing..." : "Sync now"}
          </Button>
          {queue.summary.synced > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void queue.clearSynced()}
            >
              Clear synced
            </Button>
          ) : null}
        </div>
      </form>
      <CaptureQueueList
        captures={queue.captures}
        onRemove={(captureId) => void queue.removeCapture(captureId)}
      />
    </section>
  );
}
