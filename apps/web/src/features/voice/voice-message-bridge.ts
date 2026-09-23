import {
  type ChatCitation,
  type VoiceSessionEndReason,
  type VoiceSessionResponse,
  voiceToolCallResponseSchema,
  voiceTurnResponseSchema
} from "@funes-vault/shared";

import { ApiError, apiFetch } from "../../lib/api/api-client";
import {
  parseFunctionCallArguments,
  parseVoiceRealtimeEvent
} from "./voice-events";
import type { VoiceSessionCallbacks } from "./voice-session";
/** Source-bound turn persistence and tool calls; media lifecycle stays in the controller. */
export function createVoiceMessageBridge({
  apiUrl,
  callbacks,
  getConfig,
  sendDataChannelEvent,
  noteActivity,
  stop
}: {
  apiUrl: string;
  callbacks: VoiceSessionCallbacks;
  getConfig: () => VoiceSessionResponse | null;
  sendDataChannelEvent: (payload: Record<string, unknown>) => void;
  noteActivity: () => void;
  stop: (reason: VoiceSessionEndReason) => Promise<void>;
}) {
  let persistedTurns = 0;
  const callNamesById = new Map<string, string>();
  let pendingCitations: ChatCitation[] = [];
  let pendingSuggestionIds: string[] = [];
  let latestSourceItemId: string | undefined;
  async function persistTurn(turn: {
    itemId: string;
    role: "user" | "assistant";
    content: string;
  }) {
    const config = getConfig();
    if (!config) {
      return;
    }

    const content = turn.content.trim();
    if (!content) {
      return;
    }

    const citations = turn.role === "assistant" ? pendingCitations : [];
    const suggestedMemoryIds =
      turn.role === "assistant" ? pendingSuggestionIds : [];

    if (turn.role === "assistant") {
      pendingCitations = [];
      pendingSuggestionIds = [];
    }

    if (turn.role === "user") {
      callbacks.dispatch({
        kind: "memory-processing",
        itemId: turn.itemId,
        result: { status: "pending" }
      });
    }
    try {
      const persisted = await apiFetch({
        apiUrl,
        path: `/v1/chat/voice-sessions/${config.voiceSessionId}/turns`,
        schema: voiceTurnResponseSchema,
        method: "POST",
        body: {
          itemId: turn.itemId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          role: turn.role,
          content,
          citations,
          suggestedMemoryIds
        }
      });

      if (turn.role === "user" && persisted.message.processing) {
        callbacks.dispatch({
          kind: "memory-processing",
          itemId: turn.itemId,
          result: persisted.message.processing
        });
        callbacks.dispatch({
          kind: "tool-trace",
          trace: {
            toolCallId: turn.itemId,
            toolName: "memory_capture",
            label: "Memory processing",
            status: "completed",
            summary: `Memory processing: ${String(persisted.message.processing.status ?? "pending")}`,
            metadata: persisted.message.processing
          }
        });
        // Add a confirmed result to Realtime context without requesting or interrupting speech.
        sendDataChannelEvent({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "system",
            content: [
              {
                type: "input_text",
                text: `Memory processing result for user item ${turn.itemId}: ${JSON.stringify(persisted.message.processing)}`
              }
            ]
          }
        });
      }
      persistedTurns += 1;
    } catch {
      callbacks.dispatch({
        kind: "tool-trace",
        trace: {
          toolCallId: `persist-${Date.now()}`,
          toolName: "persist_turn",
          label: "Transcript save",
          status: "failed",
          summary:
            "Could not save this turn to the thread. It remains in the live transcript.",
          metadata: {}
        }
      });
    }
  }

  async function executeToolCall(
    callId: string,
    name: string,
    args: Record<string, unknown>
  ) {
    const config = getConfig();
    if (!config) {
      return;
    }

    let output: unknown = {
      error: "Tool bridge unavailable.",
      retryable: true
    };

    try {
      const parsed = await apiFetch({
        apiUrl,
        path: `/v1/chat/voice-sessions/${config.voiceSessionId}/tool-calls`,
        schema: voiceToolCallResponseSchema,
        method: "POST",
        body: {
          sourceItemId: latestSourceItemId,
          toolName: name,
          toolCallId: callId,
          arguments: args
        }
      });

      output = parsed.output ?? {};

      for (const event of parsed.events) {
        if (event.type === "tool-trace") {
          callbacks.dispatch({ kind: "tool-trace", trace: event.data });
        }
        if (event.type === "memory-citation") {
          pendingCitations = [
            ...pendingCitations.filter(
              (citation) => citation.memoryId !== event.data.memoryId
            ),
            {
              memoryId: event.data.memoryId,
              title: event.data.title,
              categoryKeys: event.data.categoryKeys,
              sensitivity: event.data.sensitivity,
              relevanceScore: event.data.relevanceScore
            }
          ];
        }
        if (
          event.type === "memory-suggestion" &&
          event.data.status === "QUEUED_FOR_REVIEW"
        ) {
          if (event.data.suggestionId) {
            pendingSuggestionIds = [
              ...pendingSuggestionIds,
              event.data.suggestionId
            ];
          }
          callbacks.dispatch({ kind: "suggestion-queued" });
          callbacks.onSuggestionsChanged?.();
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The server says this session is over (for example max duration
        // enforced server-side); wind the client down to match.
        void stop("max_duration");

        return;
      }

      // Leave the retryable error output for the model.
    }

    sendDataChannelEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output ?? {})
      }
    });
    sendDataChannelEvent({ type: "response.create" });
  }

  function handleDataChannelMessage(message: MessageEvent<string>) {
    let raw: unknown;

    try {
      raw = JSON.parse(message.data);
    } catch {
      return;
    }

    const action = parseVoiceRealtimeEvent(raw);

    if (!action) {
      return;
    }

    noteActivity();

    if (action.kind === "function-call-named") {
      callNamesById.set(action.callId, action.name);

      return;
    }

    if (action.kind === "function-call") {
      const name = action.name ?? callNamesById.get(action.callId);

      if (name) {
        void executeToolCall(
          action.callId,
          name,
          parseFunctionCallArguments(action.argumentsJson)
        );
      }

      return;
    }

    if (action.kind === "user-speech-started") {
      latestSourceItemId = undefined;
    }
    callbacks.dispatch(action);

    if (action.kind === "user-transcript-done") {
      latestSourceItemId = action.itemId;
      void persistTurn({
        role: "user",
        itemId: action.itemId,
        content: action.text
      });
    }
    if (action.kind === "assistant-transcript-done") {
      void persistTurn({
        role: "assistant",
        itemId: action.itemId,
        content: action.text
      });
    }
  }

  return {
    handleDataChannelMessage,
    persistedTurns: () => persistedTurns,
    reset: () => {
      persistedTurns = 0;
      callNamesById.clear();
      pendingCitations = [];
      pendingSuggestionIds = [];
      latestSourceItemId = undefined;
    }
  };
}
