"use client";
import { memoryResponseSchema } from "@funes-vault/shared";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiQuery } from "../../../lib/api/use-api";
export function useMemoryDetail(id: string | null) {
  return useApiQuery({
    key: queryKeys.memories.detail(id),
    path: `/v1/memories/${encodeURIComponent(id ?? "")}`,
    schema: memoryResponseSchema,
    enabled: Boolean(id)
  });
}
