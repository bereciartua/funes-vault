import {
  type CreatePolicyRequest,
  policyResponseSchema,
  type UpdatePolicyRequest
} from "@funes-vault/shared";

import { queryKeys } from "../../../lib/api/query-keys";
import { useApiMutation } from "../../../lib/api/use-api";
const invalidate = [
  queryKeys.policies.all,
  queryKeys.clients.all,
  queryKeys.overview,
  queryKeys.audit.all
];
export function usePolicyMutations() {
  const create = useApiMutation({
    path: "/v1/policies",
    schema: policyResponseSchema,
    body: (draft: CreatePolicyRequest) => draft,
    invalidate
  });
  const restore = useApiMutation({
    path: (clientId: string) => `/v1/policies/defaults/${clientId}`,
    schema: policyResponseSchema,
    body: () => undefined,
    invalidate
  });
  const update = useApiMutation({
    path: ({ id }: { id: string; draft: UpdatePolicyRequest }) =>
      `/v1/policies/${id}`,
    method: "PATCH",
    schema: policyResponseSchema,
    body: ({ draft }) => draft,
    invalidate
  });
  const remove = useApiMutation({
    path: (id: string) => `/v1/policies/${id}`,
    method: "DELETE",
    schema: policyResponseSchema,
    body: () => undefined,
    invalidate
  });

  return {
    create,
    restore,
    update,
    remove,
    isPending:
      restore.isPending ||
      create.isPending ||
      update.isPending ||
      remove.isPending
  };
}
