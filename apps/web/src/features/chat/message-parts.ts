import {
  type ChatProviderDisclosure,
  type FunesDataParts
} from "@funes-vault/shared";

import {
  ChatEntry,
  FunesDataPart,
  FunesPart,
  FunesUIMessage,
  PendingInitialChatMessage
} from "./types";
export function stripMarkdownPreview(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/([*_])([^*_]+)\1/g, "$2")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
function partText(message: FunesUIMessage) {
  return message.parts
    .filter((part): part is Extract<FunesPart, { type: "text" }> => {
      return part.type === "text";
    })
    .map((part) => part.text)
    .join("\n")
    .trim();
}
export function dataParts<Key extends keyof FunesDataParts>(
  message: FunesUIMessage,
  type: Key
): Array<FunesDataPart<Key>> {
  return message.parts.filter(
    (part): part is FunesDataPart<Key> => part.type === `data-${type}`
  );
}
export function entryToUiMessage(
  entry: ChatEntry,
  index: number
): FunesUIMessage {
  const parts: FunesUIMessage["parts"] = [
    {
      type: "text",
      text: entry.content,
      state: "done"
    }
  ];

  for (const [citationIndex, citation] of (entry.citations ?? []).entries()) {
    parts.push({
      type: "data-memory-citation",
      id: `${entry.id ?? index}-${citation.memoryId}`,
      data: {
        ...citation,
        ref: `[${citationIndex + 1}]`
      }
    });
  }

  if (entry.processing && Object.keys(entry.processing).length) {
    parts.push({
      type: "data-tool-trace",
      id: `${entry.id}-processing`,
      data: {
        toolCallId: entry.id ?? String(index),
        toolName: "memory_capture",
        label: "Memory processing",
        status: entry.processing.status === "failed" ? "failed" : "completed",
        summary: `Memory processing: ${String(entry.processing.status ?? "pending")}`,
        metadata: entry.processing
      }
    });
  }
  if (entry.provider) {
    parts.push({
      type: "data-provider-disclosure",
      id: `${entry.id ?? index}-provider`,
      data: entry.provider
    });
  }

  for (const suggestionId of entry.suggestedMemoryIds ?? []) {
    parts.push({
      type: "data-memory-suggestion",
      id: suggestionId,
      data: {
        suggestionId,
        title: "Queued memory suggestion",
        status: "QUEUED_FOR_REVIEW",
        memoryId: null,
        policyId: null,
        auditEventId: null,
        decision: "ALLOW",
        categoryKeys: []
      }
    });
  }

  return {
    id: entry.id ?? `local-${entry.role}-${index}`,
    role: entry.role,
    metadata: {
      persistedMessageId: entry.id,
      createdAt: entry.createdAt,
      provider: entry.provider,
      processing: entry.processing
    },
    parts
  };
}
function messageRequestPayload(message: FunesUIMessage) {
  return {
    id: message.id,
    role: message.role,
    metadata: message.metadata,
    parts: message.parts
      .filter((part) => part.type === "text")
      .map((part) => ({
        type: "text",
        text: part.type === "text" ? part.text : ""
      }))
  };
}
function uiMessageToChatEntry(message: FunesUIMessage): ChatEntry | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  const content = partText(message);
  if (!content) {
    return null;
  }

  return {
    id: message.metadata?.persistedMessageId ?? message.id,
    role: message.role,
    content,
    processing: message.metadata?.processing,
    citations: dataParts(message, "memory-citation").map((part) => part.data),
    provider:
      message.metadata?.provider ??
      dataParts(message, "provider-disclosure").at(-1)?.data,
    suggestedMemoryIds: dataParts(message, "memory-suggestion")
      .map((part) => part.data.suggestionId)
      .filter((suggestionId): suggestionId is string => Boolean(suggestionId)),
    createdAt: message.metadata?.createdAt
  };
}
export function uiMessagesToChatEntries(messages: FunesUIMessage[]) {
  return messages
    .map((message) => uiMessageToChatEntry(message))
    .filter((entry): entry is ChatEntry => Boolean(entry));
}
export function mergeFinishedMessage(
  messages: FunesUIMessage[],
  finishedMessage: FunesUIMessage
) {
  const existingIndex = messages.findIndex(
    (message) => message.id === finishedMessage.id
  );

  if (existingIndex === -1) {
    return [...messages, finishedMessage];
  }

  return messages.map((message, index) =>
    index === existingIndex ? finishedMessage : message
  );
}
export function buildChatStreamRequestBody({
  isDraftNewThread,
  messageId,
  messages,
  sessionId,
  trigger
}: {
  isDraftNewThread: boolean;
  messageId: string | undefined;
  messages: FunesUIMessage[];
  sessionId: string | null;
  trigger: unknown;
}) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((candidate) => candidate.role === "user");
  const shouldStartNewThread = isDraftNewThread || sessionId === null;

  return {
    sessionId: shouldStartNewThread ? undefined : (sessionId ?? undefined),
    startNewThread: shouldStartNewThread ? true : undefined,
    submissionId: latestUserMessage?.id,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    trigger,
    messageId,
    message: latestUserMessage ? partText(latestUserMessage) : "",
    messages: messages.map(messageRequestPayload)
  };
}
export function shouldConsumePendingInitialMessage({
  consumedPendingIds,
  isStreaming,
  pendingInitialMessage
}: {
  consumedPendingIds: Set<string>;
  isStreaming: boolean;
  pendingInitialMessage: PendingInitialChatMessage | null;
}) {
  return Boolean(
    pendingInitialMessage &&
    !isStreaming &&
    !consumedPendingIds.has(pendingInitialMessage.id)
  );
}
export function providerNoticeFor(provider?: ChatProviderDisclosure) {
  if (!provider) {
    return null;
  }

  return provider.usesThirdParty
    ? `${provider.provider} ${provider.model}: ${provider.disclosure}`
    : `${provider.provider} ${provider.model}: no third-party model disclosure reported.`;
}
