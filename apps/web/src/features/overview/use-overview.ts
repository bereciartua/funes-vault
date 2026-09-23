"use client";
import { overviewResponseSchema } from "@funes-vault/shared";

import { queryKeys } from "../../lib/api/query-keys";
import { useApiQuery } from "../../lib/api/use-api";
export function useOverview() {
  return useApiQuery({
    key: queryKeys.overview,
    path: "/v1/overview",
    schema: overviewResponseSchema
  });
}
