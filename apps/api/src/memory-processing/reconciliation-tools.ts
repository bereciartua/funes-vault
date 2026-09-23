export const reconciliationTools = {
  search_memories: "memory_search",
  list_queued_memory_suggestions: "suggestion_search",
  update_memory: "mutation",
  archive_memory: "mutation",
  reject_memory_suggestion: "mutation"
} as const;
export function reconciliationToolNames(
  kind?: "memory_search" | "suggestion_search" | "mutation"
) {
  return Object.entries(reconciliationTools)
    .filter(([, value]) => !kind || kind === value)
    .map(([name]) => name);
}
