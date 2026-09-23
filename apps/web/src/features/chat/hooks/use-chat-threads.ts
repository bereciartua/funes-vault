"use client";
import {
  chatThreadSummarySchema,
  listChatThreadsResponseSchema
} from "@funes-vault/shared";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation, useApiQuery } from "../../../lib/api/use-api";
export function useChatThreads(page: number) {
  return useApiQuery({
    retainPreviousPage: true,
    key: queryKeys.chat.threads(page),
    path: `/v1/chat/threads?page=${page}&limit=10`,
    schema: listChatThreadsResponseSchema
  });
}
export function useThreadRename() {
  return useApiMutation({
    path: ({ sessionId }: { sessionId: string; title: string }) =>
      `/v1/chat/threads/${encodeURIComponent(sessionId)}`,
    method: "PATCH",
    body: (input) => ({ title: input.title }),
    schema: chatThreadSummarySchema,
    invalidate: [queryKeys.chat.all]
  });
}
