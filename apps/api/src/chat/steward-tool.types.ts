import type { ChatCitation, FunesDataParts } from "@funes-vault/shared";
import { z } from "zod";

import type { ExtractionReconciliationService } from "../memory-processing/extraction-reconciliation.service.js";
import type { ExtractionRunService } from "../memory-processing/extraction-run.service.js";
import type {
  ChatMemoryToolsService,
  StewardChannel
} from "./chat-memory-tools.service.js";
export type MemoryCategoryForTool = {
  key: string;
  name: string;
  reconciliation?: "memory_search" | "suggestion_search" | "mutation";
  description: string | null;
};

export type StewardToolEvent =
  | { type: "memory-citation"; data: FunesDataParts["memory-citation"] }
  | { type: "policy-decision"; data: FunesDataParts["policy-decision"] }
  | { type: "memory-suggestion"; data: FunesDataParts["memory-suggestion"] }
  | { type: "audit-event"; data: FunesDataParts["audit-event"] }
  | { type: "tool-trace"; data: FunesDataParts["tool-trace"] };

export type StewardToolRunState = {
  toolCitations: ChatCitation[];
  citationIndexByMemoryId: Map<string, number>;
  suggestedMemoryIds: string[];
};

export type StewardToolContext = {
  userId: string;
  sourceMessageId?: string;
  runs?: Pick<ExtractionRunService, "result">;
  reconciliation?: Pick<
    ExtractionReconciliationService,
    "complete" | "recordTool"
  >;
  channel: StewardChannel;
  categories: MemoryCategoryForTool[];
  chatMemoryTools: ChatMemoryToolsService;
  state: StewardToolRunState;
  emit: (event: StewardToolEvent) => void;
};

export type StewardToolDefinition = {
  reconciliation?: "memory_search" | "suggestion_search" | "mutation";
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (
    context: StewardToolContext,
    input: unknown,
    toolCallId: string
  ) => Promise<unknown>;
};
