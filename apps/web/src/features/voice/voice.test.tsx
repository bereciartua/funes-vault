import type { ReactNode } from "react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { ApiProvider } from "../../lib/api/api-context";
import { renderToStaticMarkup as renderStatic } from "../../test/render";
import {
  parseFunctionCallArguments,
  parseVoiceRealtimeEvent
} from "./voice-events";
import {
  initialVoiceUiState,
  voiceSessionReducer,
  voiceStatusLabel,
  type VoiceUiAction,
  type VoiceUiState
} from "./voice-session-state";
import {
  voiceToneForState,
  VoiceToolActivity,
  VoiceTranscript
} from "./VoiceSessionPanel";

function reduceAll(actions: VoiceUiAction[], from?: VoiceUiState) {
  return actions.reduce(voiceSessionReducer, from ?? initialVoiceUiState());
}

describe("realtime event parsing", () => {
  it("parses transcripts for both sides, including beta aliases", () => {
    expect(
      parseVoiceRealtimeEvent({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "item_1",
        transcript: "Remember that I prefer window seats."
      })
    ).toEqual({
      kind: "user-transcript-done",
      itemId: "item_1",
      text: "Remember that I prefer window seats."
    });

    expect(
      parseVoiceRealtimeEvent({
        type: "response.output_audio_transcript.delta",
        item_id: "item_2",
        delta: "Queued"
      })
    ).toEqual({
      kind: "assistant-transcript-delta",
      itemId: "item_2",
      delta: "Queued"
    });

    expect(
      parseVoiceRealtimeEvent({
        type: "response.audio_transcript.done",
        item_id: "item_2",
        transcript: "Queued that for review."
      })
    ).toEqual({
      kind: "assistant-transcript-done",
      itemId: "item_2",
      text: "Queued that for review."
    });
  });

  it("parses function calls and their name announcements", () => {
    expect(
      parseVoiceRealtimeEvent({
        type: "response.output_item.added",
        item: {
          type: "function_call",
          call_id: "call_1",
          name: "suggest_memory"
        }
      })
    ).toEqual({
      kind: "function-call-named",
      callId: "call_1",
      name: "suggest_memory"
    });

    expect(
      parseVoiceRealtimeEvent({
        type: "response.function_call_arguments.done",
        call_id: "call_1",
        arguments: '{"title":"Window seats"}'
      })
    ).toEqual({
      kind: "function-call",
      callId: "call_1",
      name: null,
      argumentsJson: '{"title":"Window seats"}'
    });
  });

  it("parses speech, lifecycle, and error events and ignores the rest", () => {
    expect(
      parseVoiceRealtimeEvent({ type: "input_audio_buffer.speech_started" })
    ).toEqual({ kind: "user-speech-started" });
    expect(parseVoiceRealtimeEvent({ type: "response.done" })).toEqual({
      kind: "response-done"
    });
    expect(
      parseVoiceRealtimeEvent({
        type: "error",
        error: { message: "Session expired" }
      })
    ).toEqual({ kind: "error", message: "Session expired" });
    expect(parseVoiceRealtimeEvent({ type: "rate_limits.updated" })).toBeNull();
    expect(parseVoiceRealtimeEvent("not-an-object")).toBeNull();
  });

  it("parses malformed function arguments to an empty object", () => {
    expect(parseFunctionCallArguments('{"a":1}')).toEqual({ a: 1 });
    expect(parseFunctionCallArguments("{broken")).toEqual({});
    expect(parseFunctionCallArguments('["array"]')).toEqual({});
  });
});

describe("voice session state machine", () => {
  it("walks the happy path to a live session", () => {
    const state = reduceAll([
      { kind: "start-requested" },
      { kind: "mic-granted" },
      { kind: "connected" }
    ]);

    expect(state.status).toBe("live");
    expect(voiceStatusLabel(state)).toBe("Live — speak when ready");
  });

  it("accumulates transcript deltas and finalizes lines", () => {
    const state = reduceAll([
      { kind: "start-requested" },
      { kind: "mic-granted" },
      { kind: "connected" },
      { kind: "assistant-transcript-delta", itemId: "a1", delta: "Queued " },
      { kind: "assistant-transcript-delta", itemId: "a1", delta: "that." },
      {
        kind: "assistant-transcript-done",
        itemId: "a1",
        text: "Queued that for review."
      }
    ]);

    expect(state.lines).toEqual([
      {
        id: "a1",
        role: "assistant",
        text: "Queued that for review.",
        final: true
      }
    ]);
  });

  it("surfaces mic denial and connection failures as error states", () => {
    expect(
      reduceAll([
        { kind: "start-requested" },
        { kind: "mic-denied", message: "Microphone access was denied." }
      ]).status
    ).toBe("error");

    const failed = reduceAll([
      { kind: "start-requested" },
      { kind: "mic-granted" },
      { kind: "connection-failed", message: "No network." }
    ]);
    expect(failed.status).toBe("error");
    expect(voiceStatusLabel(failed)).toBe("No network.");
  });

  it("labels deterministic end reasons", () => {
    const endings: Array<[VoiceUiAction, string]> = [
      [{ kind: "ended", reason: "max_duration" }, "time limit"],
      [{ kind: "ended", reason: "idle_timeout" }, "inactivity"],
      [{ kind: "ended", reason: "user_ended" }, "Session ended."]
    ];

    for (const [action, expected] of endings) {
      const state = reduceAll([
        { kind: "start-requested" },
        { kind: "mic-granted" },
        { kind: "connected" },
        action
      ]);
      expect(state.status).toBe("ended");
      expect(voiceStatusLabel(state)).toContain(expected);
    }
  });

  it("counts queued suggestions and keeps recent tool activity", () => {
    const state = reduceAll([
      { kind: "start-requested" },
      { kind: "mic-granted" },
      { kind: "connected" },
      { kind: "suggestion-queued" },
      {
        kind: "tool-trace",
        trace: {
          toolCallId: "call_1",
          toolName: "request_memory",
          label: "Memory retrieval",
          status: "completed",
          summary: "1 memory references returned.",
          metadata: {}
        }
      }
    ]);

    expect(state.queuedSuggestionCount).toBe(1);
    expect(state.toolActivity).toHaveLength(1);
    expect(voiceToneForState(state)).toBe("safe");
  });
});

describe("voice transcript rendering", () => {
  it("renders live turns as chat-style messages with a voice badge", () => {
    const state = reduceAll([
      { kind: "start-requested" },
      { kind: "mic-granted" },
      { kind: "connected" },
      {
        kind: "user-transcript-done",
        itemId: "u1",
        text: "Remember that I prefer window seats."
      },
      {
        kind: "assistant-transcript-delta",
        itemId: "a1",
        delta: "Queued"
      }
    ]);
    const html = renderToStaticMarkup(
      createElement(VoiceTranscript, { lines: state.lines, live: true })
    );

    expect(html).toContain("Remember that I prefer window seats.");
    expect(html).toContain("memory-message--user");
    expect(html).toContain("memory-message--assistant");
    expect(html).toContain("Voice");
    expect(html).toContain('data-final="false"');
  });

  it("prompts the user while live with no lines yet and hides otherwise", () => {
    const liveHtml = renderToStaticMarkup(
      createElement(VoiceTranscript, { lines: [], live: true })
    );
    expect(liveHtml).toContain("Funes is listening");

    const idleHtml = renderToStaticMarkup(
      createElement(VoiceTranscript, { lines: [], live: false })
    );
    expect(idleHtml).toBe("");
  });

  it("renders tool activity chips", () => {
    const html = renderToStaticMarkup(
      createElement(VoiceToolActivity, {
        traces: [
          {
            toolCallId: "call_1",
            toolName: "suggest_memory",
            label: "Memory suggestion",
            status: "completed",
            summary: "Queued a memory suggestion for review.",
            metadata: {}
          }
        ]
      })
    );

    expect(html).toContain("Memory suggestion");
  });
});

describe("source-bound voice memory outcomes", () => {
  it("keeps a delayed result attached to its user turn after speech ends", () => {
    const state = reduceAll([
      {
        kind: "user-transcript-done",
        itemId: "source",
        text: "Remember concise answers."
      },
      {
        kind: "memory-processing",
        itemId: "source",
        result: { status: "pending" }
      },
      {
        kind: "assistant-transcript-done",
        itemId: "reply",
        text: "I am checking."
      },
      { kind: "ended", reason: "user_ended" },
      {
        kind: "memory-processing",
        itemId: "source",
        result: {
          status: "completed",
          outcomes: [{ status: "QUEUED_FOR_REVIEW" }],
          processors: ["typesafe", "openai"]
        }
      }
    ]);
    expect(state.lines[0]?.processing?.status).toBe("completed");
    expect(state.lines[1]?.processing).toBeUndefined();
    const markup = renderToStaticMarkup(
      createElement(VoiceTranscript, { lines: state.lines, live: false })
    );
    expect(markup).toContain("1 queued");
    expect(markup).toContain("TypeSafe Jev");
  });
});

function renderToStaticMarkup(children: ReactNode) {
  return renderStatic(
    <ApiProvider apiUrl="http://api">{children}</ApiProvider>
  );
}
