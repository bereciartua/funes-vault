import { listClientsResponseSchema } from "@funes-vault/shared";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiQuery } from "../../../lib/api/use-api";
export function useClients(page: number, limit: number) {
  return useApiQuery({
    retainPreviousPage: true,
    key: [...queryKeys.clients.list(page), limit],
    path: `/v1/clients?${new URLSearchParams({ page: String(page), limit: String(limit) })}`,
    schema: listClientsResponseSchema
  });
}
