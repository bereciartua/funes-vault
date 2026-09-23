"use client";
import { memoryProvenanceResponseSchema } from "@funes-vault/shared";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiQuery } from "../../../lib/api/use-api";
export function useMemoryProvenance(id: string | null) {
  return useApiQuery({
    key: queryKeys.memories.provenance(id),
    path: `/v1/memories/${encodeURIComponent(id ?? "")}/provenance`,
    schema: memoryProvenanceResponseSchema,
    enabled: Boolean(id)
  });
}
