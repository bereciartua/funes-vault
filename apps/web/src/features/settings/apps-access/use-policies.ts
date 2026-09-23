import { listPoliciesResponseSchema } from "@funes-vault/shared";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiQuery } from "../../../lib/api/use-api";
export function usePolicies(clientId: string) {
  return useApiQuery({
    retainPreviousPage: true,
    key: queryKeys.policies.byClient(clientId),
    path: `/v1/policies?${new URLSearchParams({ clientId, page: "1", limit: "50" })}`,
    schema: listPoliciesResponseSchema
  });
}
