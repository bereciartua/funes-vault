import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiQueryKey, queryKeys } from "../lib/api/query-keys";
import { installApiMock } from "../test/api-mock";
import { queryWrapper, testApiUrl } from "../test/query-wrapper";
import { useReachability } from "./use-reachability";
import { useSession } from "./use-session";
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("owner session boundary", () => {
  it("shares reachability polling and clears every owner cache on logout", async () => {
    const fetch = installApiMock([
      { path: "/health", response: { status: "ok" } },
      {
        path: "/auth/me",
        response: {
          user: {
            id: "owner-a",
            email: "owner@example.com",
            displayName: null,
            role: "OWNER"
          }
        }
      },
      { method: "POST", path: "/auth/logout", response: { ok: true } },
      { path: "/auth/options", response: { demoLoginEnabled: true } }
    ]);
    const { client, wrapper } = queryWrapper();
    const privateKey = apiQueryKey(
      testApiUrl,
      queryKeys.memories.detail("private-memory")
    );
    client.setQueryData(privateKey, { body: "Owner A private data" });
    const { result } = renderHook(
      () => ({ session: useSession(), status: useReachability() }),
      { wrapper }
    );
    await waitFor(() =>
      expect(result.current.session.status).toBe("authenticated")
    );
    expect(localStorage.getItem(`funes-offline-owner:${testApiUrl}`)).toBe(
      "owner-a"
    );
    expect(
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/health"))
    ).toHaveLength(1);
    await act(async () => {
      await result.current.session.logout();
    });
    await waitFor(() => expect(result.current.session.user).toBeNull());
    expect(client.getQueryData(privateKey)).toBeUndefined();
    expect(
      localStorage.getItem(`funes-offline-owner:${testApiUrl}`)
    ).toBeNull();
  });
  it("clears private cached data when another API reports session expiration", async () => {
    installApiMock([
      { path: "/health", response: { status: "ok" } },
      {
        path: "/auth/me",
        response: {
          user: {
            id: "owner-a",
            email: "owner@example.com",
            displayName: null,
            role: "USER"
          }
        }
      },
      { path: "/auth/options", response: { demoLoginEnabled: false } }
    ]);
    const { client, wrapper } = queryWrapper();
    const { result } = renderHook(useSession, { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    const privateKey = apiQueryKey(
      testApiUrl,
      queryKeys.chat.thread("private-thread")
    );
    client.setQueryData(privateKey, { messages: ["private"] });
    act(() =>
      window.dispatchEvent(new CustomEvent("funes-vault:session-expired"))
    );
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(client.getQueryData(privateKey)).toBeUndefined();
  });
});

it("preserves authentication and private cache through a health failure", async () => {
  let unavailable = false;
  installApiMock([
    {
      path: "/health",
      response: () => {
        if (unavailable) {
          throw new TypeError("network down");
        }

        return { status: "ok" };
      }
    },
    {
      path: "/auth/me",
      response: {
        user: {
          id: "known-owner",
          email: "known@example.com",
          displayName: null,
          role: "USER"
        }
      }
    }
  ]);
  const { client, wrapper } = queryWrapper();
  const { result } = renderHook(useSession, { wrapper });
  await waitFor(() => expect(result.current.status).toBe("authenticated"));
  const key = apiQueryKey(
    testApiUrl,
    queryKeys.memories.detail("draft"),
    "known-owner"
  );
  client.setQueryDefaults(key, { gcTime: Infinity });
  client.setQueryData(key, { body: "Private cached memory" });
  unavailable = true;
  await act(async () => {
    await result.current.reachability.retry();
  });
  await waitFor(() =>
    expect(result.current.reachability.reachability).toBe("unreachable")
  );
  expect(result.current.status).toBe("authenticated");
  expect(client.getQueryData(key)).toEqual({ body: "Private cached memory" });
});

it("remembers only an owner hint offline and removes it on session expiration", async () => {
  localStorage.setItem(`funes-offline-owner:${testApiUrl}`, "known-owner");
  localStorage.setItem("funes-offline-owner:http://other.test", "other-owner");
  installApiMock([
    {
      path: "/health",
      response: () => {
        throw new TypeError("offline");
      }
    },
    {
      path: "/auth/me",
      response: () => {
        throw new TypeError("offline");
      }
    }
  ]);
  const { result } = renderHook(useSession, {
    wrapper: queryWrapper().wrapper
  });
  await waitFor(() => expect(result.current.status).toBe("unreachable"));
  expect(result.current.user).toBeNull();
  expect(result.current.offlineOwnerId).toBe("known-owner");
  act(() =>
    window.dispatchEvent(new CustomEvent("funes-vault:session-expired"))
  );
  await waitFor(() => expect(result.current.offlineOwnerId).toBeNull());
  expect(localStorage.getItem(`funes-offline-owner:${testApiUrl}`)).toBeNull();
  expect(localStorage.getItem("funes-offline-owner:http://other.test")).toBe(
    "other-owner"
  );
});
