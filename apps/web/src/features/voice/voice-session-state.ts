import type {
  FunesDataParts,
  MemoryProcessingResult,
  VoiceSessionEndReason
} from "@funes-vault/shared";

import type { VoiceRealtimeAction } from "./voice-events";

// Pure state machine for the voice session UI. The WebRTC controller feeds
// it lifecycle events and parsed Realtime actions; components render from it.

type VoiceSessionStatus =
  "idle" | "requesting-mic" | "connecting" | "live" | "ended" | "error";

export type VoiceTranscriptLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
  processing?: MemoryProcessingResult;
};

export type VoiceUiState = {
  status: VoiceSessionStatus;
  isUserSpeaking: boolean;
  isAssistantResponding: boolean;
  lines: VoiceTranscriptLine[];
  toolActivity: Array<FunesDataParts["tool-trace"]>;
  queuedSuggestionCount: number;
  error: string | null;
  endReason: VoiceSessionEndReason | null;
};

export type VoiceUiAction =
  | {
      kind: "memory-processing";
      itemId: string;
      result: MemoryProcessingResult;
    }
  | { kind: "start-requested" }
  | { kind: "mic-granted" }
  | { kind: "mic-denied"; message: string }
  | { kind: "connected" }
  | { kind: "connection-failed"; message: string }
  | { kind: "tool-trace"; trace: FunesDataParts["tool-trace"] }
  | { kind: "suggestion-queued" }
  | { kind: "ended"; reason: VoiceSessionEndReason }
  | VoiceRealtimeAction;

export function initialVoiceUiState(): VoiceUiState {
  return {
    status: "idle",
    isUserSpeaking: false,
    isAssistantResponding: false,
    lines: [],
    toolActivity: [],
    queuedSuggestionCount: 0,
    error: null,
    endReason: null
  };
}

function upsertLine(
  lines: VoiceTranscriptLine[],
  line: VoiceTranscriptLine,
  mode: "append-delta" | "replace"
): VoiceTranscriptLine[] {
  const existing = lines.find((candidate) => candidate.id === line.id);

  if (!existing) {
    return [...lines, line];
  }

  return lines.map((candidate) =>
    candidate.id === line.id
      ? {
          ...candidate,
          text:
            mode === "append-delta" ? candidate.text + line.text : line.text,
          final: line.final
        }
      : candidate
  );
}

export function voiceSessionReducer(
  state: VoiceUiState,
  action: VoiceUiAction
): VoiceUiState {
  switch (action.kind) {
    case "memory-processing":
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.id === action.itemId
            ? { ...line, processing: action.result }
            : line
        )
      };
    case "start-requested":
      return { ...initialVoiceUiState(), status: "requesting-mic" };
    case "mic-granted":
      return { ...state, status: "connecting" };
    case "mic-denied":
      return { ...state, status: "error", error: action.message };
    case "connected":
    case "session-ready":
      return state.status === "connecting"
        ? { ...state, status: "live" }
        : state;
    case "connection-failed":
      return { ...state, status: "error", error: action.message };
    case "user-speech-started":
      return { ...state, isUserSpeaking: true };
    case "user-speech-stopped":
      return { ...state, isUserSpeaking: false };
    case "user-transcript-delta":
      return {
        ...state,
        lines: upsertLine(
          state.lines,
          {
            id: action.itemId,
            role: "user",
            text: action.delta,
            final: false
          },
          "append-delta"
        )
      };
    case "user-transcript-done":
      return {
        ...state,
        lines: upsertLine(
          state.lines,
          {
            id: action.itemId,
            role: "user",
            text: action.text,
            final: true
          },
          "replace"
        )
      };
    case "assistant-transcript-delta":
      return {
        ...state,
        isAssistantResponding: true,
        lines: upsertLine(
          state.lines,
          {
            id: action.itemId,
            role: "assistant",
            text: action.delta,
            final: false
          },
          "append-delta"
        )
      };
    case "assistant-transcript-done":
      return {
        ...state,
        lines: upsertLine(
          state.lines,
          {
            id: action.itemId,
            role: "assistant",
            text: action.text,
            final: true
          },
          "replace"
        )
      };
    case "response-started":
      return { ...state, isAssistantResponding: true };
    case "response-done":
      return { ...state, isAssistantResponding: false };
    case "tool-trace": {
      const others = state.toolActivity.filter(
        (trace) => trace.toolCallId !== action.trace.toolCallId
      );

      return { ...state, toolActivity: [...others, action.trace].slice(-6) };
    }
    case "suggestion-queued":
      return {
        ...state,
        queuedSuggestionCount: state.queuedSuggestionCount + 1
      };
    case "error":
      return { ...state, status: "error", error: action.message };
    case "ended":
      return {
        ...state,
        status: "ended",
        isUserSpeaking: false,
        isAssistantResponding: false,
        endReason: action.reason
      };
    case "function-call":
    case "function-call-named":
      return state;
    default:
      return state;
  }
}

export function voiceStatusLabel(state: VoiceUiState) {
  switch (state.status) {
    case "requesting-mic":
      return "Waiting for microphone access...";
    case "connecting":
      return "Connecting to your vault's voice...";
    case "live":
      if (state.isUserSpeaking) {
        return "Listening...";
      }
      if (state.isAssistantResponding) {
        return "Funes is speaking...";
      }

      return "Live — speak when ready";
    case "ended":
      switch (state.endReason) {
        case "max_duration":
          return "Session ended: time limit reached.";
        case "idle_timeout":
          return "Session ended after inactivity.";
        case "connection_lost":
          return "Session ended: connection lost.";
        case "error":
          return "Session ended after an error.";
        default:
          return "Session ended.";
      }
    case "error":
      return state.error ?? "Voice session failed.";
    default:
      return "";
  }
}
