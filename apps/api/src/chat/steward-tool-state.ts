import type { StewardToolRunState } from "./steward-tool.types.js";

export function createStewardToolRunState(): StewardToolRunState {
  return {
    toolCitations: [],
    citationIndexByMemoryId: new Map<string, number>(),
    suggestedMemoryIds: []
  };
}
