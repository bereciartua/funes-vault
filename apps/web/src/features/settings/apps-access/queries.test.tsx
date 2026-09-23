import {
  type Client,
  createClientRequestSchema,
  createPolicyRequestSchema,
  type Policy
} from "@funes-vault/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installApiMock } from "../../../test/api-mock";
import { pageFixture } from "../../../test/fixtures/memory";
import { queryWrapper } from "../../../test/query-wrapper";
import { useClientMutations } from "./use-client-mutations";
import { useClients } from "./use-clients";
import { usePolicies } from "./use-policies";
import { usePolicyMutations } from "./use-policy-mutations";
const client: Client = {
  id: "client-a",
  name: "Example agent",
  type: "MCP_CLIENT",
  trustLevel: "APPROVED",
  declaredRetention: "NO_STORAGE",
  hasToken: true,
  policyCount: 1,
  oauthConnector: false,
  lastUsedAt: null,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z"
};
const policy: Policy = {
  id: "policy-a",
  clientId: client.id,
  clientName: client.name,
  purpose: "coding",
  allowedCategoryKeys: [],
  deniedCategoryKeys: [],
  maxSensitivity: "INTERNAL",
  operations: ["READ"],
  requiresConfirmation: true,
  expiresAt: null,
  createdAt: client.createdAt,
  updatedAt: client.updatedAt
};
afterEach(() => vi.unstubAllGlobals());
describe("client and policy queries", () => {
  it("refetches clients after create, update and delete, without exposing the returned token in list cache", async () => {
    const fetch = installApiMock([
      { path: "/v1/clients", response: pageFixture([client]) },
      {
        method: "POST",
        path: "/v1/clients",
        response: { client, token: "one-time-token" }
      },
      {
        method: "PATCH",
        path: `/v1/clients/${client.id}`,
        response: { client }
      },
      {
        method: "DELETE",
        path: `/v1/clients/${client.id}`,
        response: { client }
      }
    ]);
    const { result } = renderHook(
      () => ({ list: useClients(1, 25), mutations: useClientMutations() }),
      { wrapper: queryWrapper().wrapper }
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    await act(async () => {
      const resultValue = await result.current.mutations.create.mutateAsync(
        createClientRequestSchema.parse({
          name: client.name,
          type: client.type
        })
      );
      expect(resultValue.token).toBe("one-time-token");
    });
    await act(async () => {
      await result.current.mutations.update.mutateAsync({
        id: client.id,
        draft: { trustLevel: "BLOCKED" }
      });
    });
    await act(async () => {
      await result.current.mutations.remove.mutateAsync(client.id);
    });
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "GET")
    ).toHaveLength(4);
    expect(JSON.stringify(result.current.list.data)).not.toContain(
      "one-time-token"
    );
  });
  it("invalidates client counts and policy rows after each policy mutation", async () => {
    const fetch = installApiMock([
      { path: "/v1/clients", response: pageFixture([client]) },
      { path: "/v1/policies", response: pageFixture([policy]) },
      { method: "POST", path: "/v1/policies", response: { policy } },
      {
        method: "PATCH",
        path: `/v1/policies/${policy.id}`,
        response: { policy }
      },
      {
        method: "DELETE",
        path: `/v1/policies/${policy.id}`,
        response: { policy }
      }
    ]);
    const { result } = renderHook(
      () => ({
        clients: useClients(1, 25),
        list: usePolicies(client.id),
        mutations: usePolicyMutations()
      }),
      { wrapper: queryWrapper().wrapper }
    );
    await waitFor(() =>
      expect(
        result.current.list.isSuccess && result.current.clients.isSuccess
      ).toBe(true)
    );
    await act(async () => {
      await result.current.mutations.create.mutateAsync(
        createPolicyRequestSchema.parse({
          clientId: client.id,
          purpose: "coding"
        })
      );
    });
    await act(async () => {
      await result.current.mutations.update.mutateAsync({
        id: policy.id,
        draft: { maxSensitivity: "LOW" }
      });
    });
    await act(async () => {
      await result.current.mutations.remove.mutateAsync(policy.id);
    });
    expect(
      fetch.mock.calls.filter(
        ([url, init]) =>
          String(url).includes("/v1/clients?") && init?.method === "GET"
      )
    ).toHaveLength(4);
    expect(
      fetch.mock.calls.filter(
        ([url, init]) =>
          String(url).includes("/v1/policies?") && init?.method === "GET"
      )
    ).toHaveLength(4);
  });
});
