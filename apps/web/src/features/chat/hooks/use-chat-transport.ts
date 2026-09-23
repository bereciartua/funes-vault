"use client";
import { useChat } from "@ai-sdk/react";
import {
  type FunesDataParts,
  funesDataPartSchemas,
  funesMessageMetadataSchema
} from "@funes-vault/shared";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useApiUrl } from "../../../lib/api/api-context";
import {
  buildChatStreamRequestBody,
  dataParts,
  entryToUiMessage,
  mergeFinishedMessage,
  providerNoticeFor,
  uiMessagesToChatEntries
} from "../message-parts";
import type { FunesUIMessage, MemoryChatProps } from "../types";
type TransportProps = Pick<
  MemoryChatProps,
  | "sessionId"
  | "initialEntries"
  | "setProviderNotice"
  | "onSuggestionsChanged"
  | "onThreadsChanged"
  | "onThreadState"
>;
export function useChatTransport({
  sessionId,
  initialEntries,
  setProviderNotice,
  onSuggestionsChanged,
  onThreadsChanged,
  onThreadState
}: TransportProps) {
  const apiUrl = useApiUrl();
  // Route changes remount MemoryChat. Persisting a local draft keeps this SDK instance.
  const chatId = useRef(sessionId ?? "memory-workbench");
  // Applying a newly persisted draft session during the stream changes useChat's id
  // and can drop the in-flight assistant text. Apply it after finish/error instead.
  const pendingThreadStateRef = useRef<FunesDataParts["thread-state"] | null>(
    null
  );
  const liveMessagesRef = useRef<FunesUIMessage[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  const initialMessages = useMemo(
    () => initialEntries.map((entry, index) => entryToUiMessage(entry, index)),
    [initialEntries]
  );
  const transport = useMemo(
    () =>
      new DefaultChatTransport<FunesUIMessage>({
        api: `${apiUrl}/v1/chat/messages/stream`,
        credentials: "include",
        prepareSendMessagesRequest: ({ messages, trigger, messageId }) => {
          return {
            credentials: "include",
            body: buildChatStreamRequestBody({
              isDraftNewThread: sessionIdRef.current === null,
              messageId,
              messages,
              sessionId: sessionIdRef.current,
              trigger
            })
          };
        }
      }),
    [apiUrl]
  );
  const applyPendingThreadState = useCallback(() => {
    const pendingThreadState = pendingThreadStateRef.current;
    if (!pendingThreadState) {
      return;
    }

    pendingThreadStateRef.current = null;
    onThreadState(
      pendingThreadState,
      uiMessagesToChatEntries(liveMessagesRef.current)
    );
  }, [onThreadState]);
  const {
    clearError,
    error,
    messages,
    sendMessage,
    setMessages,
    status,
    stop
  } = useChat<FunesUIMessage>({
    id: chatId.current,
    messages: initialMessages,
    transport,
    dataPartSchemas: funesDataPartSchemas,
    messageMetadataSchema: funesMessageMetadataSchema,
    onData: (dataPart) => {
      if (dataPart.type === "data-thread-state") {
        pendingThreadStateRef.current = dataPart.data;
      }

      if (dataPart.type === "data-provider-disclosure") {
        setProviderNotice(providerNoticeFor(dataPart.data));
      }

      if (
        dataPart.type === "data-memory-suggestion" &&
        ["QUEUED_FOR_REVIEW", "APPLIED"].includes(dataPart.data.status)
      ) {
        setStatusMessage(
          dataPart.data.status === "APPLIED"
            ? "Saved a memory."
            : "Queued a memory suggestion for review."
        );
        void onSuggestionsChanged();
      }

      if (dataPart.type === "data-transient-notification") {
        if (dataPart.data.level === "error") {
          setLocalError(dataPart.data.message);
        } else {
          setStatusMessage(dataPart.data.message);
        }
      }
    },
    onError: (streamError) => {
      applyPendingThreadState();
      void onThreadsChanged();
      setLocalError(
        streamError.message.includes("503")
          ? "Memory chat needs a configured model provider before Funes can answer."
          : "Memory chat could not answer that."
      );
    },
    onFinish: ({ message: finishedMessage }) => {
      liveMessagesRef.current = mergeFinishedMessage(
        liveMessagesRef.current,
        finishedMessage
      );
      applyPendingThreadState();
      const provider =
        finishedMessage.metadata?.provider ??
        dataParts(finishedMessage, "provider-disclosure").at(-1)?.data;

      if (provider) {
        setProviderNotice(providerNoticeFor(provider));
      }

      if (
        dataParts(finishedMessage, "memory-suggestion").length > 0 ||
        finishedMessage.metadata?.processing?.outcomes?.some((outcome) =>
          ["APPLIED", "reconciled"].includes(outcome.status)
        )
      ) {
        void onSuggestionsChanged();
      }

      void onThreadsChanged();
    }
  });
  useEffect(() => {
    liveMessagesRef.current = messages;
  }, [messages]);
  const isStreaming = status === "submitted" || status === "streaming";

  const resetThreadState = useCallback(() => {
    pendingThreadStateRef.current = null;
    sessionIdRef.current = null;
  }, []);

  return {
    clearError,
    error,
    messages,
    sendMessage,
    setMessages,
    stop,
    isStreaming,
    statusMessage,
    setStatusMessage,
    localError,
    setLocalError,
    resetThreadState
  };
}
