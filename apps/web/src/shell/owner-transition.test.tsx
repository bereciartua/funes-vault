import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";

import { apiQueryKey, queryKeys } from "../lib/api/query-keys";
import { useApiQuery } from "../lib/api/use-api";
import { installApiMock } from "../test/api-mock";
import { queryWrapper, testApiUrl } from "../test/query-wrapper";
import { AuthGate } from "./AuthGate";

vi.mock("next/navigation", () => ({
  usePathname: () => "/vault",
  useSearchParams: () => new URLSearchParams()
}));
afterEach(() => vi.unstubAllGlobals());
it("isolates and clears private data when a background session request switches owners", async () => {
  let owner = "alice";
  const clients = new Set<QueryClient>();
  installApiMock([
    {
      path: "/auth/me",
      response: () => ({
        user: {
          id: owner,
          email: `${owner}@example.test`,
          displayName: owner,
          role: "USER",
          authProvider: "google",
          createdAt: "2026-09-22T00:00:00.000Z"
        }
      })
    },
    {
      path: "/health",
      response: {
        status: "ok",
        service: "funes-vault-api",
        timestamp: "2026-09-22T00:00:00.000Z"
      }
    },
    {
      path: "/private",
      response: () => ({ text: `${owner}'s private memory` })
    }
  ]);
  function Private() {
    clients.add(useQueryClient());
    const data = useApiQuery({
      key: ["private"],
      path: "/private",
      schema: z.object({ text: z.string() })
    });

    return <p>{data.data?.text ?? "Loading owner data"}</p>;
  }
  const { client, wrapper } = queryWrapper();
  render(
    <AuthGate>
      <Private />
    </AuthGate>,
    { wrapper }
  );
  await screen.findByText("alice's private memory");
  const aliceCache = [...clients][0]!;
  expect(
    aliceCache.getQueryData(apiQueryKey(testApiUrl, ["private"], "alice"))
  ).toBeTruthy();
  owner = "bob";
  await act(() =>
    client.invalidateQueries({
      queryKey: apiQueryKey(testApiUrl, queryKeys.session)
    })
  );
  await screen.findByText("bob's private memory");
  expect(screen.queryByText("alice's private memory")).toBeNull();
  expect(clients.size).toBe(2);
  await waitFor(() =>
    expect(aliceCache.getQueryCache().getAll()).toHaveLength(0)
  );
});
