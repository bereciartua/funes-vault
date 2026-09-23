import "./chat.css";

import { MessageSquareText, Plus, Square } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { IconButton } from "../../components/ui/button";
import { FeedbackMessages } from "../../components/ui/feedback-messages";
import { useFocusTrap } from "../../components/ui/use-focus-trap";
import { useMediaQuery } from "../../lib/use-media-query";
import type { VoiceTranscriptLine } from "../voice/voice-session-state";
import { VoiceSessionPanel } from "../voice/VoiceSessionPanel";
import { ChatComposer } from "./components/ChatComposer";
import { ChatThreadHistory } from "./components/ChatThreadHistory";
import { ChatTranscript } from "./components/ChatTranscript";
import { useChatTransport } from "./hooks/use-chat-transport";
import {
  entryToUiMessage,
  shouldConsumePendingInitialMessage
} from "./message-parts";
import { MemoryChatProps, openingChatEntry } from "./types";
export function MemoryChat({
  activeThreadTitle,
  providerNotice,
  autoStartVoice,
  initialEntries,
  pendingInitialMessage,
  sessionId,
  selectedThreadId,
  threadPagination,
  threads,
  onOpenMemory,
  onOpenInbox,
  onPendingInitialMessageConsumed,
  onVoiceStartConsumed,
  onRenameThread,
  setProviderNotice,
  onSuggestionsChanged,
  onThreadPageChange,
  onThreadsChanged,
  onThreadState,
  onSelectThread,
  onNewThread
}: MemoryChatProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const consumedPendingIdsRef = useRef<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [isThreadHistoryOpen, setIsThreadHistoryOpen] = useState(false);
  const narrow = useMediaQuery("(max-width: 980px)");
  useFocusTrap(narrow && isThreadHistoryOpen, drawerRef);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [voiceLines, setVoiceLines] = useState<VoiceTranscriptLine[]>([]);
  const [isVoiceLive, setIsVoiceLive] = useState(false);
  const isDraftNewThread = sessionId === null;
  const {
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
  } = useChatTransport({
    sessionId,
    initialEntries,
    setProviderNotice,
    onSuggestionsChanged,
    onThreadsChanged,
    onThreadState
  });
  const showThreadStarters =
    !isStreaming &&
    !isVoiceOpen &&
    voiceLines.length === 0 &&
    !messages.some((entry) => entry.role === "user");

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }

    requestAnimationFrame(() => {
      transcript.scrollTop = transcript.scrollHeight;
    });
  }, [messages, voiceLines]);

  useEffect(() => {
    if (!isThreadHistoryOpen) {
      return;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsThreadHistoryOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isThreadHistoryOpen]);

  useEffect(() => {
    if (
      !shouldConsumePendingInitialMessage({
        consumedPendingIds: consumedPendingIdsRef.current,
        isStreaming,
        pendingInitialMessage
      })
    ) {
      return;
    }
    if (!pendingInitialMessage) {
      return;
    }

    consumedPendingIdsRef.current.add(pendingInitialMessage.id);
    setStatusMessage(null);
    setLocalError(null);
    clearError();
    setMessage("");
    void sendMessage({
      text: pendingInitialMessage.text,
      metadata: { createdAt: new Date().toISOString() }
    });
    onPendingInitialMessageConsumed(pendingInitialMessage.id);
  }, [
    clearError,
    isStreaming,
    onPendingInitialMessageConsumed,
    pendingInitialMessage,
    sendMessage,
    setStatusMessage,
    setLocalError
  ]);

  const startNewThread = useCallback(async () => {
    setStatusMessage(null);
    setLocalError(null);
    clearError();
    resetThreadState();
    setIsThreadHistoryOpen(false);
    const nextEntries = [openingChatEntry];
    const nextMessages = nextEntries.map((entry, index) =>
      entryToUiMessage(entry, index)
    );
    setMessages(nextMessages);
    setProviderNotice(null);
    setMessage("");
    setStatusMessage("Started a new thread.");
    await onNewThread();
  }, [
    clearError,
    onNewThread,
    resetThreadState,
    setLocalError,
    setMessages,
    setProviderNotice,
    setStatusMessage
  ]);

  useEffect(() => {
    if (!autoStartVoice || isVoiceOpen || isStreaming) {
      return;
    }

    onVoiceStartConsumed?.();
    // Voice from the overview means "start a conversation": bind the session
    // to a fresh thread rather than whatever thread was open last.
    void startNewThread().then(() => setIsVoiceOpen(true));
  }, [
    autoStartVoice,
    isStreaming,
    isVoiceOpen,
    onVoiceStartConsumed,
    startNewThread
  ]);

  const selectThreadFromHistory = useCallback(
    async (threadId: string) => {
      await onSelectThread(threadId);
      setIsThreadHistoryOpen(false);
    },
    [onSelectThread]
  );

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = message.trim();
    if (!trimmed || isStreaming) {
      return;
    }

    setStatusMessage(null);
    setLocalError(null);
    clearError();
    setMessage("");
    await sendMessage({
      text: trimmed,
      metadata: { createdAt: new Date().toISOString() }
    });
  }

  return (
    <div
      className="chat-layout memory-workbench"
      data-thread-history-open={isThreadHistoryOpen ? "true" : undefined}
    >
      {isThreadHistoryOpen ? (
        <button
          type="button"
          className="thread-history-backdrop"
          aria-label="Dismiss thread history panel"
          onClick={() => setIsThreadHistoryOpen(false)}
        />
      ) : null}
      <div
        ref={drawerRef}
        inert={(narrow && !isThreadHistoryOpen) || undefined}
        role={isThreadHistoryOpen ? "dialog" : undefined}
        aria-modal={isThreadHistoryOpen || undefined}
        aria-label="Previous chat threads"
        tabIndex={-1}
        className="thread-history-drawer"
        data-open={isThreadHistoryOpen ? "true" : "false"}
      >
        <ChatThreadHistory
          disabled={isStreaming}
          isDraftNewThread={isDraftNewThread}
          pagination={threadPagination}
          selectedThreadId={selectedThreadId}
          threads={threads}
          onClose={() => setIsThreadHistoryOpen(false)}
          onPageChange={onThreadPageChange}
          onRenameThread={onRenameThread}
          onSelectThread={selectThreadFromHistory}
        />
      </div>
      <section
        className="chat-panel workbench-conversation"
        aria-label="Chat"
        inert={(narrow && isThreadHistoryOpen) || undefined}
      >
        <div className="editor-heading">
          <div>
            <p className="eyebrow">Chat</p>
            <h1>
              {isDraftNewThread
                ? "New thread"
                : (activeThreadTitle ?? "Ask your vault")}
            </h1>
          </div>
          <div className="chat-heading-actions">
            {isStreaming ? <p className="muted">Streaming...</p> : null}
            <IconButton
              type="button"
              label="Previous threads"
              title="Threads"
              variant="secondary"
              className="chat-thread-toggle"
              aria-expanded={isThreadHistoryOpen}
              onClick={() => setIsThreadHistoryOpen((current) => !current)}
            >
              <MessageSquareText
                aria-hidden="true"
                size={20}
                strokeWidth={2.5}
              />
            </IconButton>
            <IconButton
              type="button"
              label="New thread"
              title="New thread"
              variant="secondary"
              onClick={() => void startNewThread()}
              disabled={isStreaming}
            >
              <Plus aria-hidden="true" size={20} strokeWidth={2.5} />
            </IconButton>
            {isStreaming ? (
              <IconButton
                type="button"
                label="Stop stream"
                title="Stop"
                variant="secondary"
                onClick={() => void stop()}
              >
                <Square aria-hidden="true" size={18} strokeWidth={2.5} />
              </IconButton>
            ) : null}
          </div>
        </div>

        {isVoiceOpen ? (
          <VoiceSessionPanel
            sessionId={sessionId}
            onClose={() => {
              setIsVoiceOpen(false);
              setVoiceLines([]);
              setIsVoiceLive(false);
            }}
            onSuggestionsChanged={() => void onSuggestionsChanged()}
            onTranscriptChange={(lines, live) => {
              setVoiceLines(lines);
              setIsVoiceLive(live);
            }}
            onSessionEnded={({ threadSessionId, persistedTurns }) => {
              void onThreadsChanged();
              if (threadSessionId && persistedTurns > 0) {
                // Reload the thread so persisted turns replace the live
                // transcript lines without a gap or duplicate.
                void onSelectThread(threadSessionId).then(() =>
                  setVoiceLines([])
                );
              }
            }}
          />
        ) : null}

        <ChatTranscript
          onOpenInbox={onOpenInbox}
          onOpenMemory={onOpenMemory}
          transcriptRef={transcriptRef}
          showThreadStarters={showThreadStarters}
          messages={messages}
          voiceLines={voiceLines}
          isVoiceLive={isVoiceLive}
          isVoiceOpen={isVoiceOpen}
          onPrompt={(prompt) => {
            setMessage(prompt);
            requestAnimationFrame(() => messageRef.current?.focus());
          }}
        />

        {providerNotice ? (
          <p role="status">External processing: {providerNotice}</p>
        ) : null}
        <ChatComposer
          message={message}
          onMessageChange={setMessage}
          onSubmit={(event) => void submitMessage(event)}
          textareaRef={messageRef}
          disabled={isStreaming}
          voiceOpen={isVoiceOpen}
          onStartVoice={() => setIsVoiceOpen(true)}
          onStop={isStreaming ? () => void stop() : undefined}
        />
        <FeedbackMessages
          message={statusMessage}
          error={localError ?? error?.message}
        />
      </section>
    </div>
  );
}
