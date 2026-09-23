"use client";
import { listMemorySuggestionsResponseSchema } from "@funes-vault/shared";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiQuery } from "../../../lib/api/use-api";
export function useSuggestions(page: number, limit = 25) {
  return useApiQuery({
    retainPreviousPage: true,
    key: [...queryKeys.suggestions.list(page), limit],
    path: `/v1/memory-suggestions?page=${page}&limit=${limit}&status=QUEUED_FOR_REVIEW`,
    schema: listMemorySuggestionsResponseSchema
  });
}
