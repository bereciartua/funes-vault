"use client";
import type { FunesDataParts } from "@funes-vault/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { FeedbackMessages } from "../../components/ui/feedback-messages";
import { emptyPagination } from "../../components/ui/pagination";
import { useApiOwner, useApiUrl } from "../../lib/api/api-context";
import { errorCopy } from "../../lib/api/error-copy";
import { apiQueryKey, queryKeys } from "../../lib/api/query-keys";
import { useInvalidateQueries } from "../../lib/api/use-api";
import { routes } from "../../lib/routes";
import { useChatLaunch } from "../../shell/chat-launch";
import { useChatSession } from "./hooks/use-chat-session";
import { useChatThreads, useThreadRename } from "./hooks/use-chat-threads";
import { MemoryChat } from "./MemoryChat";
import { type ChatEntry, openingChatEntry } from "./types";

const emptyEntries = [openingChatEntry];
export function ChatPage({
  threadId = null,
  draft = false
}: {
  threadId?: string | null;
  draft?: boolean;
}) {
  const apiUrl = useApiUrl();
  const ownerId = useApiOwner();
  const router = useRouter();
  const client = useQueryClient();
  const invalidate = useInvalidateQueries();
  const [page, setPage] = useState(1);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const session = useChatSession(
    threadId ?? createdSessionId,
    draft && !createdSessionId
  );
  const threads = useChatThreads(page);
  const rename = useThreadRename();
  const { pending, setPending, providerNotice, setProviderNotice } =
    useChatLaunch();
  const entries = session.data?.messages.length
    ? session.data.messages
    : emptyEntries;
  const onThreadState = useCallback(
    (state: FunesDataParts["thread-state"], liveEntries: ChatEntry[]) => {
      const data = {
        sessionId: state.sessionId,
        title: state.title ?? null,
        titleLocked: state.titleLocked ?? false,
        messages: liveEntries
      };
      client.setQueryData(
        apiQueryKey(apiUrl, queryKeys.chat.thread(state.sessionId), ownerId),
        data
      );
      client.setQueryData(
        apiQueryKey(apiUrl, queryKeys.chat.session, ownerId),
        data
      );
      setCreatedSessionId(state.sessionId);
      window.history.replaceState(
        null,
        "",
        `/chat/${encodeURIComponent(state.sessionId)}`
      );
    },
    [apiUrl, ownerId, client]
  );
  if (!draft && session.isPending) {
    return <p role="status">Loading chat...</p>;
  }
  if (!draft && session.error) {
    return <FeedbackMessages error={errorCopy(session.error)} />;
  }

  return (
    <MemoryChat
      key={draft ? "draft" : (threadId ?? "latest")}
      providerNotice={providerNotice}
      activeThreadTitle={session.data?.title ?? null}
      initialEntries={draft ? emptyEntries : entries}
      sessionId={
        createdSessionId ?? (draft ? null : (session.data?.sessionId ?? null))
      }
      selectedThreadId={
        createdSessionId ??
        (draft ? null : (threadId ?? session.data?.sessionId ?? null))
      }
      threadPagination={threads.data?.pagination ?? emptyPagination(10)}
      threads={threads.data?.items ?? []}
      onThreadPageChange={setPage}
      onOpenMemory={async (id) => {
        router.push(routes.memory(id));
      }}
      onOpenInbox={() => router.push("/inbox")}
      pendingInitialMessage={pending && "text" in pending ? pending : null}
      autoStartVoice={Boolean(pending && "voice" in pending)}
      onPendingInitialMessageConsumed={() => setPending(null)}
      onVoiceStartConsumed={() => setPending(null)}
      setProviderNotice={setProviderNotice}
      onSuggestionsChanged={() =>
        invalidate(
          queryKeys.suggestions.all,
          queryKeys.memories.all,
          queryKeys.overview
        )
      }
      onThreadsChanged={() => invalidate(queryKeys.chat.threadLists)}
      onThreadState={onThreadState}
      onRenameThread={async (sessionId, title) => {
        await rename.mutateAsync({ sessionId, title });
      }}
      onSelectThread={async (id) => {
        await client.invalidateQueries({
          queryKey: apiQueryKey(apiUrl, queryKeys.chat.thread(id), ownerId)
        });
        router.push(`/chat/${encodeURIComponent(id)}`);
      }}
      onNewThread={async () => {
        setCreatedSessionId(null);
        setPending(null);
        router.push("/chat/new");
      }}
    />
  );
}
