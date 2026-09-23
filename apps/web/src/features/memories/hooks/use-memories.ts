"use client";
import {
  listCategoriesResponseSchema,
  listMemoriesResponseSchema
} from "@funes-vault/shared";
import { useEffect, useState } from "react";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiQuery } from "../../../lib/api/use-api";
import { vaultSearchDebounceMs } from "../../../lib/debounce";
import type { Filters } from "../memory-filters";

export function useCategories() {
  return useApiQuery({
    key: queryKeys.categories,
    path: "/v1/categories",
    schema: listCategoriesResponseSchema
  });
}

export function useMemories(filters: Filters, page: number, limit: number) {
  const [query, setQuery] = useState(filters.query);
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setQuery(filters.query),
      vaultSearchDebounceMs
    );

    return () => window.clearTimeout(timeout);
  }, [filters.query]);
  const input = { ...filters, query, page, limit };
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit)
  });
  for (const [key, value] of Object.entries({ ...filters, query })) {
    if (value) {
      params.set(key === "categoryKey" ? "categoryKeys" : key, value);
    }
  }

  return useApiQuery({
    retainPreviousPage: true,
    key: queryKeys.memories.list(input),
    path: `/v1/memories?${params}`,
    schema: listMemoriesResponseSchema
  });
}
