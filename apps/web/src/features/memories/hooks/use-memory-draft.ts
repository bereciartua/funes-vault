"use client";
import type { Memory } from "@funes-vault/shared";
import { useCallback, useState } from "react";

import { emptyDraft, type MemoryEditorMode, toDraft } from "../memory-draft";

export function useMemoryDraft() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [editorMode, setEditorMode] = useState<MemoryEditorMode>("closed");
  const startCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setEditorMode("create");
  };
  const startEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setDraft(toDraft(memory));
    setEditorMode("edit");
  };
  const close = useCallback(() => {
    setEditingId(null);
    setEditorMode("closed");
  }, []);
  const toggleCategory = (key: string) =>
    setDraft((current) => ({
      ...current,
      categoryKeys: current.categoryKeys.includes(key)
        ? current.categoryKeys.filter((category) => category !== key)
        : [...current.categoryKeys, key]
    }));

  return {
    editingId,
    draft,
    setDraft,
    editorMode,
    startCreate,
    startEdit,
    close,
    toggleCategory
  };
}
