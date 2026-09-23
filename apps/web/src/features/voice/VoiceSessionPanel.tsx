"use client";
import "./voice.css";

import type {
  FunesDataParts,
  VoiceSessionEndReason
} from "@funes-vault/shared";
import { Mic, PhoneOff, X } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";

import { Button, IconButton } from "../../components/ui/button";
import { StatusBadge } from "../../components/ui/status-badge";
import { useApiUrl } from "../../lib/api/api-context";
import { pluralize } from "../../lib/text";
import { MemoryProcessingOutcome } from "../chat/components/MemoryProcessingOutcome";
import { createVoiceSessionController } from "./voice-session";
import {
  initialVoiceUiState,
  voiceSessionReducer,
  voiceStatusLabel,
  type VoiceTranscriptLine,
  type VoiceUiState
} from "./voice-session-state";

const voiceDisclosureCopy =
  "While live, your microphone audio and any retrieved memory text stream to the OpenAI Realtime API. Finalized transcripts also use OpenAI for memory capture, plus the TypeSafe Jev memory classifier when selected and enabled in your memory processing settings.";

export function voiceToneForState(state: VoiceUiState) {
  if (state.status === "error") {
    return "danger" as const;
  }
  if (state.status === "ended") {
    return "neutral" as const;
  }
  if (state.status === "live") {
    return state.isAssistantResponding ? "info" : "safe";
  }

  return "attention" as const;
}

// Live voice turns render inside the chat transcript, styled like the
// persisted messages they will become once saved.
export function VoiceTranscript({
  lines,
  live
}: {
  lines: VoiceTranscriptLine[];
  live: boolean;
}) {
  if (lines.length === 0 && !live) {
    return null;
  }

  return (
    <>
      {lines.length === 0 && live ? (
        <p className="voice-live-hint" aria-live="polite">
          Say something — Funes is listening.
        </p>
      ) : null}
      {lines.map((line) => (
        <article
          key={line.id}
          className={`memory-message memory-message--${line.role} voice-live-message`}
          data-final={line.final}
        >
          <div className="memory-message-meta">
            <strong>{line.role === "user" ? "You" : "Funes"}</strong>
            <span className="voice-turn-badge" title="Live voice transcript">
              <Mic aria-hidden="true" size={12} strokeWidth={2.6} />
              Voice
            </span>
          </div>
          <p className="voice-live-text">{line.text || "..."}</p>
          <MemoryProcessingOutcome initial={line.processing} />
        </article>
      ))}
    </>
  );
}

export function VoiceToolActivity({
  traces
}: {
  traces: Array<FunesDataParts["tool-trace"]>;
}) {
  if (traces.length === 0) {
    return null;
  }

  return (
    <div className="voice-tool-activity" aria-label="Tool activity">
      {traces.map((trace) => (
        <StatusBadge
          key={`${trace.toolCallId}-${trace.status}`}
          descriptor={{
            icon: trace.status === "running" ? "Activity" : "Wrench",
            label: trace.label,
            tone:
              trace.status === "completed"
                ? "safe"
                : trace.status === "running"
                  ? "info"
                  : trace.status === "denied"
                    ? "danger"
                    : "attention"
          }}
        />
      ))}
    </div>
  );
}

export function VoiceSessionPanel({
  sessionId,
  onClose,
  onSuggestionsChanged,
  onSessionEnded,
  onTranscriptChange
}: {
  sessionId: string | null;
  onClose: () => void;
  onSuggestionsChanged: () => void;
  onSessionEnded: (input: {
    threadSessionId: string | null;
    reason: VoiceSessionEndReason;
    persistedTurns: number;
  }) => void;
  onTranscriptChange?: (lines: VoiceTranscriptLine[], live: boolean) => void;
}) {
  const apiUrl = useApiUrl();
  const [state, dispatch] = useReducer(
    voiceSessionReducer,
    undefined,
    initialVoiceUiState
  );
  const endedRef = useRef(false);
  const onTranscriptChangeRef = useRef(onTranscriptChange);
  useEffect(() => {
    onTranscriptChangeRef.current = onTranscriptChange;
  }, [onTranscriptChange]);
  const [boundSessionId] = useState(sessionId);
  const callbackRef = useRef({ onSuggestionsChanged, onSessionEnded });
  useEffect(() => {
    callbackRef.current = { onSuggestionsChanged, onSessionEnded };
  }, [onSuggestionsChanged, onSessionEnded]);
  const [controller] = useState(() =>
    createVoiceSessionController({
      apiUrl,
      callbacks: {
        dispatch,
        onSuggestionsChanged: () => callbackRef.current.onSuggestionsChanged(),
        onEnded: (input) => {
          endedRef.current = true;
          callbackRef.current.onSessionEnded({
            threadSessionId: input.threadSessionId,
            reason: input.reason,
            persistedTurns: input.persistedTurns
          });
        }
      }
    })
  );

  useEffect(() => {
    onTranscriptChangeRef.current?.(state.lines, state.status === "live");
  }, [state.lines, state.status]);

  useEffect(() => {
    // The short delay lets React strict-mode's immediate cleanup cancel the
    // first invocation before any session is minted.
    const startTimer = window.setTimeout(() => {
      void controller.start(
        boundSessionId
          ? { sessionId: boundSessionId }
          : { startNewThread: true }
      );
    }, 60);

    return () => {
      window.clearTimeout(startTimer);
      if (!endedRef.current) {
        void controller.stop("user_ended");
      }
    };
  }, [controller, boundSessionId]);

  const isBusy =
    state.status === "requesting-mic" || state.status === "connecting";
  const isLive = state.status === "live";

  return (
    <section className="voice-panel" aria-label="Voice session">
      <div className="voice-panel-heading">
        <div className="voice-panel-title">
          <span
            className="voice-indicator"
            data-live={isLive}
            data-speaking={state.isAssistantResponding}
            aria-hidden="true"
          >
            <Mic size={18} strokeWidth={2.4} />
          </span>
          <div>
            <p className="eyebrow">Voice session</p>
            <p className="voice-status" role="status">
              {voiceStatusLabel(state)}
            </p>
          </div>
        </div>
        <div className="voice-panel-actions">
          {isLive || isBusy ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => void controller.stop("user_ended")}
            >
              <PhoneOff aria-hidden="true" size={16} strokeWidth={2.5} />
              End
            </Button>
          ) : (
            <IconButton
              type="button"
              label="Close voice panel"
              title="Close"
              variant="secondary"
              onClick={onClose}
            >
              <X aria-hidden="true" size={18} strokeWidth={2.5} />
            </IconButton>
          )}
        </div>
      </div>

      <VoiceToolActivity traces={state.toolActivity} />

      {state.queuedSuggestionCount > 0 ? (
        <p className="voice-suggestion-note">
          {pluralize(state.queuedSuggestionCount, "memory suggestion")} queued
          for review in your inbox.
        </p>
      ) : null}

      {state.status === "ended" ? (
        <div className="voice-ended-actions">
          <p className="muted">
            The transcript is saved to this thread — you can keep going by text.
          </p>
          <Button type="button" onClick={onClose}>
            Back to chat
          </Button>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="voice-ended-actions">
          <p className="muted">
            The voice connection encountered a problem. Saved turns remain in
            this conversation.
          </p>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : null}

      <p className="voice-disclosure">{voiceDisclosureCopy}</p>
    </section>
  );
}
