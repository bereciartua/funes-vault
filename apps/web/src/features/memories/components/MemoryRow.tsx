"use client";
import { type Memory } from "@funes-vault/shared";

import { DotBadge } from "../../../components/ui/dot-badge";
import { formatRelative } from "../../../lib/dates";
import { label } from "../../../lib/domain/labels";
import { memoryBodyPreview } from "../memory-filters";
export function MemoryRow({
  memory,
  selectedId,
  selectMemory
}: {
  memory: Memory;
  selectedId: string | null;
  selectMemory: (memory: Memory) => void;
}) {
  const preview = memoryBodyPreview(memory.body);

  return (
    <button
      type="button"
      key={memory.id}
      className="memory-row quiet-list-row"
      data-selected={selectedId === memory.id}
      aria-current={selectedId === memory.id ? "true" : undefined}
      onClick={() => selectMemory(memory)}
    >
      <span className="memory-row-heading">
        <span className="memory-row-title">{memory.title}</span>
        <DotBadge
          kind="sensitivity"
          value={memory.sensitivity}
          showLabel={false}
        />
      </span>
      {preview ? <span className="memory-row-preview">{preview}</span> : null}
      <span className="memory-row-footer">
        <span className="memory-row-kind">
          {label(memory.kind)}
          {memory.status !== "ACTIVE" ? ` · ${label(memory.status)}` : ""}
        </span>
        <small className="memory-row-date">
          {formatRelative(memory.updatedAt)}
        </small>
      </span>
    </button>
  );
}
