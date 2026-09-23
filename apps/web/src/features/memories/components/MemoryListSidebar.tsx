"use client";
import { Plus } from "lucide-react";

import { Button } from "../../../components/ui/button";
import { PaginationControls } from "../../../components/ui/pagination";
import { pluralize } from "../../../lib/text";
import type { MemoryWorkspace } from "../hooks/use-memory-workspace";
import { MemoryFilters } from "./MemoryFilters";
import { MemoryList } from "./MemoryList";

export function MemoryListSidebar(
  props: Pick<
    MemoryWorkspace,
    "list" | "filters" | "pagination" | "startCreate"
  >
) {
  const { memoryPagination, changeMemoryPage, changeMemoryLimit } =
    props.pagination;
  const { startCreate } = props;
  const { isLoading } = props.list;

  return (
    <aside className="vault-sidebar" aria-label="Memory filters and list">
      <div className="vault-sidebar-header">
        <div>
          <p className="eyebrow">Vault</p>
          <strong>
            {pluralize(memoryPagination.total, "memory", "memories")}
          </strong>
        </div>
        <Button type="button" variant="secondary" onClick={startCreate}>
          <Plus aria-hidden="true" size={16} strokeWidth={2.5} />
          New
        </Button>
      </div>

      <MemoryFilters {...props.filters} />

      <MemoryList {...props.list} />
      <PaginationControls
        disabled={isLoading}
        itemLabel="memory"
        pagination={memoryPagination}
        variant="compact"
        onLimitChange={changeMemoryLimit}
        onPageChange={changeMemoryPage}
      />
    </aside>
  );
}
