import { act, render, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { installApiMock } from "../../test/api-mock";
import { ApiError } from "./api-client";
import { ApiProvider, createQueryClient } from "./api-context";
import { apiQueryKey, queryKeys } from "./query-keys";
import { useApiMutation, useApiQuery } from "./use-api";

const apiUrl = "http://vault.test";
const schema = z.object({ value: z.number() });
function setup() {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider apiUrl={apiUrl} client={client}>
      {children}
    </ApiProvider>
  );

  return { client, wrapper };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("validated API query layer", () => {
  it("shares cached results and forwards credentials and cancellation signals", async () => {
    const fetchMock = installApiMock([
      { path: "/v1/overview", response: { value: 2 } }
    ]);
    const { wrapper } = setup();
    const { result } = renderHook(
      () =>
        useApiQuery({ key: queryKeys.overview, path: "/v1/overview", schema }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.data).toEqual({ value: 2 }));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      signal: expect.any(AbortSignal)
    });
  });
  it("invalidates matching queries after a successful mutation", async () => {
    let value = 1;
    installApiMock([
      { path: "/v1/overview", response: () => ({ value }) },
      {
        method: "PATCH",
        path: "/v1/item",
        response: () => ({ value: ++value })
      }
    ]);
    const { wrapper, client } = setup();
    const { result } = renderHook(
      () => ({
        query: useApiQuery({
          key: queryKeys.overview,
          path: "/v1/overview",
          schema
        }),
        mutation: useApiMutation({
          path: "/v1/item",
          method: "PATCH",
          schema,
          invalidate: [queryKeys.overview]
        })
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.query.data?.value).toBe(1));
    await act(async () => {
      await result.current.mutation.mutateAsync();
    });
    await waitFor(() => expect(result.current.query.data?.value).toBe(2));
    expect(
      client.getQueryData(apiQueryKey(apiUrl, queryKeys.overview))
    ).toEqual({ value: 2 });
  });
  it("rejects invalid responses without caching them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installApiMock([{ path: "/bad", response: { value: "wrong type" } }]);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useApiQuery({ key: ["bad"], path: "/bad", schema }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect(result.current.error).toMatchObject({ kind: "invalid-response" });
    expect(result.current.data).toBeUndefined();
  });
  it("aborts a request after its final observer unmounts", async () => {
    let signal: AbortSignal | null | undefined;
    installApiMock([
      {
        path: "/slow",
        response: (request: { signal?: AbortSignal | null }) => {
          signal = request.signal;

          return new Promise(() => undefined);
        }
      }
    ]);
    const { wrapper } = setup();
    const { unmount } = renderHook(
      () => useApiQuery({ key: ["slow"], path: "/slow", schema }),
      { wrapper }
    );
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});

it("removes sensitive mutation results while the owner's provider stays mounted", async () => {
  const secretSchema = z.object({ token: z.string() });
  installApiMock([
    { path: "/secret", method: "POST", response: { token: "one-time-secret" } }
  ]);
  const { wrapper, client } = setup();
  let save: (() => Promise<unknown>) | undefined;
  function SecretScreen() {
    const mutation = useApiMutation({
      path: "/secret",
      method: "POST",
      schema: secretSchema
    });
    const mutateAsync = mutation.mutateAsync;
    useEffect(() => {
      save = () => mutateAsync();
    }, [mutateAsync]);

    return null;
  }
  const view = render(<SecretScreen />, { wrapper });
  await act(async () => {
    await save?.();
  });
  expect(client.getMutationCache().getAll()[0]?.state.data).toEqual({
    token: "one-time-secret"
  });
  view.rerender(<></>);
  await waitFor(() => expect(client.getMutationCache().getAll()).toEqual([]));
});

it("finishes a mutation without waiting for an unrelated refetch", async () => {
  let calls = 0;
  installApiMock([
    {
      path: "/v1/overview",
      response: () =>
        ++calls === 1 ? { value: 1 } : new Promise(() => undefined)
    },
    { path: "/v1/item", method: "POST", response: { value: 2 } }
  ]);
  const { wrapper } = setup();
  const { result } = renderHook(
    () => ({
      query: useApiQuery({
        key: queryKeys.overview,
        path: "/v1/overview",
        schema
      }),
      mutation: useApiMutation({
        path: "/v1/item",
        schema,
        invalidate: [queryKeys.overview]
      })
    }),
    { wrapper }
  );
  await waitFor(() => expect(result.current.query.data).toEqual({ value: 1 }));
  act(() => result.current.mutation.mutate());
  await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
  expect(result.current.query.isFetching).toBe(true);
});
