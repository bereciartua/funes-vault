import { ChatMessageRole } from "@funes-vault/db";
import { memoryProcessingResultSchema } from "@funes-vault/shared";

import {
  parseCitationArray,
  parseProvider,
  previewText
} from "./chat.utils.js";
type PersistedChatMessageRole = "USER" | "ASSISTANT";
type ChatSessionForResponse = {
  id: string;
  title: string | null;
  titleLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
};
type ChatThreadSummarySource = ChatSessionForResponse & {
  _count: {
    messages: number;
  };
  messages: Array<{
    content: string;
  }>;
};
export function toChatEntry(message: {
  id: string;
  role: PersistedChatMessageRole;
  content: string;
  citations: unknown;
  suggestedMemoryIds: string[];
  provider: unknown;
  createdAt: Date;
  processing?: unknown;
}) {
  return {
    processing: memoryProcessingResultSchema.safeParse(message.processing).data,
    id: message.id,
    role:
      message.role === ChatMessageRole.USER
        ? ("user" as const)
        : ("assistant" as const),
    content: message.content,
    citations: parseCitationArray(message.citations),
    suggestedMemoryIds: message.suggestedMemoryIds,
    provider: parseProvider(message.provider),
    createdAt: message.createdAt.toISOString()
  };
}
export function toThreadSummary(thread: ChatThreadSummarySource) {
  return {
    sessionId: thread.id,
    title: thread.title,
    titleLocked: thread.titleLocked,
    messageCount: thread._count.messages,
    lastMessagePreview: previewText(thread.messages[0]?.content ?? null),
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString()
  };
}
