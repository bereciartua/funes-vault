// Pure parsing of OpenAI Realtime server events into the small set of
// actions the voice UI cares about. Event names cover both the GA names and
// their beta-era aliases so a provider-side rename does not silently break
// the session loop.

export type VoiceRealtimeAction =
  | { kind: "session-ready" }
  | { kind: "user-speech-started" }
  | { kind: "user-speech-stopped" }
  | { kind: "user-transcript-delta"; itemId: string; delta: string }
  | { kind: "user-transcript-done"; itemId: string; text: string }
  | { kind: "assistant-transcript-delta"; itemId: string; delta: string }
  | { kind: "assistant-transcript-done"; itemId: string; text: string }
  | {
      kind: "function-call";
      callId: string;
      name: string | null;
      argumentsJson: string;
    }
  | { kind: "function-call-named"; callId: string; name: string }
  | { kind: "response-started" }
  | { kind: "response-done" }
  | { kind: "error"; message: string };

type RawRealtimeEvent = {
  type?: unknown;
  [key: string]: unknown;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function parseVoiceRealtimeEvent(
  raw: unknown
): VoiceRealtimeAction | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const event = raw as RawRealtimeEvent;
  const type = asString(event.type);

  switch (type) {
    case "session.created":
    case "session.updated":
      return { kind: "session-ready" };
    case "input_audio_buffer.speech_started":
      return { kind: "user-speech-started" };
    case "input_audio_buffer.speech_stopped":
      return { kind: "user-speech-stopped" };
    case "conversation.item.input_audio_transcription.delta":
      return {
        kind: "user-transcript-delta",
        itemId: asString(event.item_id, "user-item"),
        delta: asString(event.delta)
      };
    case "conversation.item.input_audio_transcription.completed":
      return {
        kind: "user-transcript-done",
        itemId: asString(event.item_id, "user-item"),
        text: asString(event.transcript)
      };
    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta":
      return {
        kind: "assistant-transcript-delta",
        itemId: asString(event.item_id, "assistant-item"),
        delta: asString(event.delta)
      };
    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done":
      return {
        kind: "assistant-transcript-done",
        itemId: asString(event.item_id, "assistant-item"),
        text: asString(event.transcript)
      };
    case "response.created":
      return { kind: "response-started" };
    case "response.done":
      return { kind: "response-done" };
    case "response.output_item.added":
    case "response.output_item.done": {
      const item = event.item as RawRealtimeEvent | undefined;

      if (
        item &&
        asString(item.type) === "function_call" &&
        asString(item.call_id) &&
        asString(item.name)
      ) {
        return {
          kind: "function-call-named",
          callId: asString(item.call_id),
          name: asString(item.name)
        };
      }

      return null;
    }
    case "response.function_call_arguments.done":
      return {
        kind: "function-call",
        callId: asString(event.call_id),
        name: asString(event.name) || null,
        argumentsJson: asString(event.arguments, "{}")
      };
    case "error": {
      const error = event.error as RawRealtimeEvent | undefined;

      return {
        kind: "error",
        message:
          asString(error?.message) || "The voice provider reported an error."
      };
    }
    default:
      return null;
  }
}

export function parseFunctionCallArguments(
  argumentsJson: string
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson);

    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
