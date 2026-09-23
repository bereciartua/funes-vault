"use client";
import {
  type BulkReviewMemorySuggestionsRequest,
  bulkReviewMemorySuggestionsResponseSchema,
  type ListMemorySuggestionsResponse,
  memorySuggestionReviewResponseSchema
} from "@funes-vault/shared";
import { useQueryClient } from "@tanstack/react-query";

import { useApiOwner, useApiUrl } from "../../../lib/api/api-context";
import { apiQueryKey, queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation } from "../../../lib/api/use-api";
export function useSuggestionReview() {
  const client = useQueryClient();
  const apiUrl = useApiUrl();
  const ownerId = useApiOwner();
  const key = apiQueryKey(apiUrl, queryKeys.suggestions.all, ownerId);
  async function removeOptimistically(ids: string[]) {
    await client.cancelQueries({ queryKey: key });
    const previous = client.getQueriesData<ListMemorySuggestionsResponse>({
      queryKey: key
    });
    client.setQueriesData<ListMemorySuggestionsResponse>(
      { queryKey: key },
      (data) =>
        data
          ? {
              ...data,
              items: data.items.filter((item) => !ids.includes(item.id))
            }
          : data
    );

    return previous;
  }
  function restore(
    _error: Error,
    _input: unknown,
    previous: Awaited<ReturnType<typeof removeOptimistically>> | undefined
  ) {
    for (const [queryKey, data] of previous ?? []) {
      client.setQueryData(queryKey, data);
    }
  }

  const invalidate = [
    queryKeys.suggestions.all,
    queryKeys.memories.all,
    queryKeys.overview,
    queryKeys.audit.all
  ];
  const single = useApiMutation({
    path: ({ id, action }: { id: string; action: "apply" | "reject" }) =>
      `/v1/memory-suggestions/${encodeURIComponent(id)}/${action}`,
    method: "PATCH",
    schema: memorySuggestionReviewResponseSchema,
    onMutate: (input) => removeOptimistically([input.id]),
    onError: restore,
    body: () => undefined,
    invalidate
  });
  const bulk = useApiMutation({
    path: "/v1/memory-suggestions/review",
    method: "PATCH",
    schema: bulkReviewMemorySuggestionsResponseSchema,
    onMutate: (input: BulkReviewMemorySuggestionsRequest) =>
      removeOptimistically(input.ids),
    onError: restore,
    onSuccess: (response, _input, previous) => {
      const failedIds = new Set(
        response.results
          .filter((item) => item.status === "failed")
          .map((item) => item.id)
      );
      for (const [queryKey, snapshot] of previous ?? []) {
        if (!snapshot) {
          continue;
        }
        client.setQueryData<ListMemorySuggestionsResponse>(
          queryKey,
          (current) => {
            if (!current) {
              return current;
            }
            const visible = new Set(current.items.map((item) => item.id));

            return {
              ...current,
              items: [
                ...current.items,
                ...snapshot.items.filter(
                  (item) => failedIds.has(item.id) && !visible.has(item.id)
                )
              ]
            };
          }
        );
      }
    },
    body: (input: BulkReviewMemorySuggestionsRequest) => input,
    invalidate
  });

  return { single, bulk };
}
