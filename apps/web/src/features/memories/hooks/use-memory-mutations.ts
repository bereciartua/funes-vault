"use client";
import {
  type CreateMemoryRequest,
  memoryResponseSchema,
  type UpdateMemoryRequest
} from "@funes-vault/shared";
import { useQueryClient } from "@tanstack/react-query";

import { useApiOwner, useApiUrl } from "../../../lib/api/api-context";
import { apiQueryKey, queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation } from "../../../lib/api/use-api";

export function useMemoryMutations() {
  const apiUrl = useApiUrl();
  const ownerId = useApiOwner();
  const client = useQueryClient();
  const options = {
    schema: memoryResponseSchema,
    invalidate: [
      queryKeys.memories.all,
      queryKeys.overview,
      queryKeys.audit.all
    ],
    onSuccess: (data: { memory: import("@funes-vault/shared").Memory }) => {
      client.setQueryData(
        apiQueryKey(apiUrl, queryKeys.memories.detail(data.memory.id), ownerId),
        data
      );
    }
  };
  const create = useApiMutation({
    ...options,
    path: "/v1/memories",
    body: (input: CreateMemoryRequest) => input
  });
  const update = useApiMutation({
    ...options,
    path: (input: { id: string; body: UpdateMemoryRequest }) =>
      `/v1/memories/${encodeURIComponent(input.id)}`,
    method: "PATCH",
    body: (input) => input.body
  });
  const remove = useApiMutation({
    ...options,
    path: (id: string) => `/v1/memories/${encodeURIComponent(id)}`,
    method: "DELETE",
    body: () => undefined
  });

  return {
    create,
    update,
    remove,
    isSaving: create.isPending || update.isPending || remove.isPending
  };
}
