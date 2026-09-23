"use client";
import type { MemoryWorkspace } from "../hooks/use-memory-workspace";
import { MemoryRow } from "./MemoryRow";

export function MemoryList(props: MemoryWorkspace["list"]) {
  const { selectedId, memories, isLoading, selectMemory } = props;

  return (
    <div
      className="memory-list"
      role="region"
      aria-busy={isLoading}
      aria-label="Memory list"
    >
      <div className="memory-list-content">
        {isLoading ? (
          <p className="muted memory-list-state">Loading memories...</p>
        ) : null}
        {!isLoading && memories.length === 0 ? (
          <p className="muted memory-list-state">
            No memories match these filters.
          </p>
        ) : null}
        {memories.map((memory) => (
          <MemoryRow
            key={memory.id}
            memory={memory}
            selectedId={selectedId}
            selectMemory={selectMemory}
          />
        ))}
      </div>
    </div>
  );
}
