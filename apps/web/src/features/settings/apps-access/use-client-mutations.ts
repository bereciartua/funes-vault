import {
  clientResponseSchema,
  type CreateClientRequest,
  type UpdateClientRequest
} from "@funes-vault/shared";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation } from "../../../lib/api/use-api";
const invalidate = [
  queryKeys.clients.all,
  queryKeys.policies.all,
  queryKeys.overview,
  queryKeys.audit.all
];
export function useClientMutations() {
  const create = useApiMutation({
    path: "/v1/clients",
    schema: clientResponseSchema,
    body: (draft: CreateClientRequest) => draft,
    invalidate
  });
  const update = useApiMutation({
    path: ({ id }: { id: string; draft: UpdateClientRequest }) =>
      `/v1/clients/${id}`,
    method: "PATCH",
    schema: clientResponseSchema,
    body: ({ draft }) => draft,
    invalidate
  });
  const remove = useApiMutation({
    path: (id: string) => `/v1/clients/${id}`,
    method: "DELETE",
    schema: clientResponseSchema,
    body: () => undefined,
    invalidate
  });

  return {
    create,
    update,
    remove,
    isPending: create.isPending || update.isPending || remove.isPending
  };
}
