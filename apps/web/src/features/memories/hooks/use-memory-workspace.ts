"use client";
import {
  createMemoryRequestSchema,
  type Memory,
  updateMemoryRequestSchema
} from "@funes-vault/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { useConfirm } from "../../../components/ui/confirmation-dialog";
import { emptyPagination } from "../../../components/ui/pagination";
import { errorCopy } from "../../../lib/api/error-copy";
import { toExpiresAtIso } from "../../../lib/dates";
import { routes } from "../../../lib/routes";
import { VAULT_MEMORY_PAGE_LIMIT } from "../memory-constants";
import {
  buildVaultFilterSummary,
  type Filters,
  initialFilters,
  vaultFiltersMatchDefaults
} from "../memory-filters";
import { useCategories, useMemories } from "./use-memories";
import { useMemoryDetail } from "./use-memory-detail";
import { useMemoryDraft } from "./use-memory-draft";
import { useMemoryMutations } from "./use-memory-mutations";
import { useMemoryProvenance } from "./use-memory-provenance";

export function useMemoryWorkspace() {
  const router = useRouter();
  const selectedId = useSearchParams().get("memoryId");
  const [filters, setFilters] = useState(initialFilters);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(VAULT_MEMORY_PAGE_LIMIT);
  const [message, setMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const list = useMemories(filters, page, limit);
  const detail = useMemoryDetail(selectedId);
  const provenance = useMemoryProvenance(selectedId);
  const categoryQuery = useCategories();
  const mutations = useMemoryMutations();
  const editor = useMemoryDraft();
  const confirm = useConfirm();
  const { editingId, close } = editor;
  useEffect(() => {
    if (editingId && editingId !== selectedId) {
      close();
    }
  }, [editingId, selectedId, close]);
  const memories = list.data?.items ?? [];
  const categories = categoryQuery.data?.items ?? [];
  const selectedMemory =
    detail.data?.memory ??
    memories.find((memory) => memory.id === selectedId) ??
    null;
  const clearFeedback = () => {
    setMessage(null);
    setMutationError(null);
  };
  const selectMemory = (memory: Memory) => {
    editor.close();
    clearFeedback();
    router.push(routes.memory(memory.id));
  };
  const startCreate = () => {
    clearFeedback();
    editor.startCreate();
    router.push("/vault");
  };
  const startEdit = () => {
    if (selectedMemory) {
      clearFeedback();
      editor.startEdit(selectedMemory);
    }
  };
  const updateFilters = (update: (current: Filters) => Filters) => {
    setFilters(update);
    setPage(1);
  };
  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };
  const changeMemoryLimit = (next: number) => {
    setLimit(next);
    setPage(1);
  };
  async function perform(
    operation: () => Promise<{ memory: Memory }>,
    success: string
  ) {
    clearFeedback();
    try {
      const { memory } = await operation();
      editor.close();
      if (memory.status === "DELETED") {
        router.push("/vault");
      } else {
        router.push(routes.memory(memory.id));
      }
      setMessage(success);
    } catch (error) {
      setMutationError(errorCopy(error, "Could not save this memory."));
    }
  }
  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { draft, editorMode } = editor;
    if (
      editorMode === "edit" &&
      selectedMemory?.status !== "DELETED" &&
      draft.status === "DELETED" &&
      !(await confirm({
        title: "Delete memory?",
        body: `Saving this change will delete "${draft.title}" from normal vault views. It cannot be restored from here.`,
        confirmLabel: "Delete memory",
        tone: "danger"
      }))
    ) {
      return;
    }
    if (editorMode === "closed") {
      return;
    }
    const fields = {
      ...draft,
      confidence: Number(draft.confidence),
      expiresAt: toExpiresAtIso(draft.expiresAt),
      sourceUri: draft.sourceUri.trim() || null
    };
    const payload = (
      editorMode === "edit"
        ? updateMemoryRequestSchema
        : createMemoryRequestSchema
    ).safeParse(fields);
    if (!payload.success) {
      setMutationError(
        payload.error.issues[0]?.message ?? "Check the memory fields."
      );

      return;
    }
    const updating = editorMode === "edit" && editingId;
    await perform(
      () =>
        updating
          ? mutations.update.mutateAsync({
              id: editingId,
              body: updateMemoryRequestSchema.parse(fields)
            })
          : mutations.create.mutateAsync(
              createMemoryRequestSchema.parse(fields)
            ),
      updating ? "Memory updated." : "Memory created."
    );
  }
  const patchSelected = async (status: Memory["status"]) => {
    if (selectedId) {
      await perform(
        () =>
          mutations.update.mutateAsync({ id: selectedId, body: { status } }),
        status === "ARCHIVED" ? "Memory archived." : "Memory restored."
      );
    }
  };
  const confirmDeleteSelected = async () => {
    if (
      selectedMemory &&
      (await confirm({
        title: "Delete memory?",
        body: `Delete "${selectedMemory.title}" from your vault. Deleted memories leave normal vault views and cannot be restored from here.`,
        confirmLabel: "Delete memory",
        tone: "danger"
      }))
    ) {
      await perform(
        () => mutations.remove.mutateAsync(selectedMemory.id),
        "Memory deleted."
      );
    }
  };
  const queryError = list.error ?? detail.error ?? categoryQuery.error;

  return {
    list: { selectedId, memories, isLoading: list.isPending, selectMemory },
    filters: {
      categories,
      filters,
      filtersExpanded,
      setFiltersExpanded,
      activeFilterSummary: buildVaultFilterSummary(filters, categories),
      filtersAreDefault: vaultFiltersMatchDefaults(filters),
      updateFilters,
      resetFilters
    },
    pagination: {
      memoryPagination: list.data?.pagination ?? emptyPagination(limit),
      changeMemoryPage: setPage,
      changeMemoryLimit
    },
    detail: {
      editorMode: editor.editorMode,
      selectedMemory,
      selectedMemoryIsVisible: memories.some(
        (memory) => memory.id === selectedId
      ),
      isSaving: mutations.isSaving,
      selectedMemoryProvenance: provenance.data ?? null,
      isLoadingProvenance: provenance.isFetching,
      patchSelected,
      confirmDeleteSelected,
      startEdit
    },
    editor: {
      draft: editor.draft,
      setDraft: editor.setDraft,
      editorMode: editor.editorMode,
      toggleCategory: editor.toggleCategory,
      categories,
      isSaving: mutations.isSaving,
      saveMemory,
      cancelEditor: editor.close
    },
    startCreate,
    feedback: {
      message,
      error: mutationError ?? (queryError ? errorCopy(queryError) : null)
    }
  };
}
export type MemoryWorkspace = ReturnType<typeof useMemoryWorkspace>;
