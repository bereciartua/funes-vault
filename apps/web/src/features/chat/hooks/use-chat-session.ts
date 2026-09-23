"use client";
import { chatSessionResponseSchema } from "@funes-vault/shared";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiQuery } from "../../../lib/api/use-api";
export function useChatSession(threadId: string | null, draft = false) {
  return useApiQuery({
    key: threadId ? queryKeys.chat.thread(threadId) : queryKeys.chat.session,
    path: threadId
      ? `/v1/chat/threads/${encodeURIComponent(threadId)}`
      : "/v1/chat/session",
    schema: chatSessionResponseSchema,
    enabled: !draft,
    refetchOnWindowFocus: false
  });
}
