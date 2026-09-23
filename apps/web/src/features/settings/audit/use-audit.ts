import {
  auditEventResponseSchema,
  listAuditEventsResponseSchema,
  listClientOptionsResponseSchema
} from "@funes-vault/shared";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiQuery } from "../../../lib/api/use-api";
export function useAudit(filters: {
  page: number;
  limit: number;
  type: string;
  clientId: string;
}) {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit)
  });
  if (filters.type) {
    params.set("type", filters.type);
  }
  if (filters.clientId) {
    params.set("clientId", filters.clientId);
  }
  const events = useApiQuery({
    retainPreviousPage: true,
    key: queryKeys.audit.list(filters),
    path: `/v1/audit-events?${params}`,
    schema: listAuditEventsResponseSchema
  });
  const clients = useApiQuery({
    key: queryKeys.clients.options,
    path: "/v1/clients/options",
    schema: listClientOptionsResponseSchema
  });

  return { events, clients };
}
export function useAuditDetail(id: string) {
  return useApiQuery({
    key: [...queryKeys.audit.all, "detail", id],
    path: `/v1/audit-events/${id}`,
    schema: auditEventResponseSchema
  });
}
