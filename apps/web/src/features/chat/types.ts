import type { MemoryProcessingResult } from "@funes-vault/shared";
import {
  type ChatCitation,
  type ChatProviderDisclosure,
  type ChatThreadSummary,
  type FunesDataParts,
  type FunesMessageMetadata,
  type Pagination
} from "@funes-vault/shared";
import { type UIMessage } from "ai";
export type FunesUIMessage = UIMessage<FunesMessageMetadata, FunesDataParts>;
export type FunesPart = FunesUIMessage["parts"][number];
export type FunesDataPart<Key extends keyof FunesDataParts> = Extract<
  FunesPart,
  { type: `data-${Key}` }
>;
export type MemoryChatProps = {
  activeThreadTitle: string | null;
  providerNotice?: string | null;
  autoStartVoice?: boolean;
  initialEntries: ChatEntry[];
  pendingInitialMessage: PendingInitialChatMessage | null;
  sessionId: string | null;
  selectedThreadId: string | null;
  threadPagination: Pagination;
  threads: ChatThreadSummary[];
  onOpenMemory: (memoryId: string) => Promise<void>;
  onOpenInbox: () => void;
  setProviderNotice: (notice: string | null) => void;
  onPendingInitialMessageConsumed: (messageId: string) => void;
  onVoiceStartConsumed?: () => void;
  onRenameThread: (sessionId: string, title: string) => Promise<void>;
  onSuggestionsChanged: () => Promise<void>;
  onThreadPageChange: (page: number) => void;
  onThreadsChanged: () => Promise<void>;
  onThreadState: (
    state: FunesDataParts["thread-state"],
    liveEntries: ChatEntry[]
  ) => void;
  onSelectThread: (sessionId: string) => Promise<void>;
  onNewThread: () => Promise<void>;
};
export type ChatEntry = {
  processing?: MemoryProcessingResult;
  id?: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  provider?: ChatProviderDisclosure;
  suggestedMemoryIds?: string[];
  createdAt?: string;
};
export type PendingInitialChatMessage = {
  id: string;
  text: string;
  startNewThread: true;
};
export const openingChatEntry: ChatEntry = {
  id: "opening-memory-workbench-message",
  role: "assistant",
  content:
    "I can talk through what your vault already knows, spot gaps, and ask questions that help turn useful context into reviewed memory suggestions. What should future assistants understand about you first?"
};
export const starterPrompts = [
  "Ask me a question that would improve my vault.",
  "What should future coding assistants know?",
  "What privacy boundaries should we capture?",
  "Help me turn my working style into memories."
];
