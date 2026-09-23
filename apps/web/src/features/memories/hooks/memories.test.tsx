import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiQueryKey, queryKeys } from "../../../lib/api/query-keys";
import { installApiMock } from "../../../test/api-mock";
import { memoryFixture, pageFixture } from "../../../test/fixtures/memory";
import { queryWrapper, testApiUrl } from "../../../test/query-wrapper";
import { initialFilters } from "../memory-filters";
import { useCategories, useMemories } from "./use-memories";
import { useMemoryDetail } from "./use-memory-detail";
import { useMemoryDraft } from "./use-memory-draft";
import { useMemoryMutations } from "./use-memory-mutations";
import { useMemoryProvenance } from "./use-memory-provenance";
afterEach(() => vi.unstubAllGlobals());
describe("memory feature data", () => {
  it("keeps list pages and owner detail separate, fetching provenance only for a selected memory", async () => {
    const memory = memoryFixture();
    const fetch = installApiMock([
      { path: "/v1/memories", response: pageFixture([memory]) },
      { path: "/v1/categories", response: { items: [] } },
      { path: "/v1/memories/memory-one", response: { memory } },
      {
        path: "/v1/memories/memory-one/provenance",
        response: { memoryId: memory.id, entries: [] }
      }
    ]);
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(
      ({ id, page }: { id: string | null; page: number }) => ({
        list: useMemories(initialFilters, page, 10),
        detail: useMemoryDetail(id),
        provenance: useMemoryProvenance(id),
        categories: useCategories()
      }),
      { wrapper, initialProps: { id: null as string | null, page: 1 } }
    );
    await waitFor(() =>
      expect(result.current.list.data?.items).toEqual([memory])
    );
    expect(fetch.mock.calls).toHaveLength(2);
    rerender({ id: memory.id, page: 2 });
    await waitFor(() =>
      expect(result.current.provenance.data?.memoryId).toBe(memory.id)
    );
    expect(result.current.detail.data?.memory).toEqual(memory);
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("page=2"))
    ).toBe(true);
  });
  it("debounces search changes while retaining the selected category", async () => {
    const fetch = installApiMock([
      { path: "/v1/memories", response: pageFixture([]) }
    ]);
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(
      ({ query }) =>
        useMemories({ ...initialFilters, query, categoryKey: "work" }, 1, 10),
      { wrapper, initialProps: { query: "" } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ query: "concise" });
    expect(fetch.mock.calls).toHaveLength(1);
    await waitFor(() => expect(fetch.mock.calls).toHaveLength(2));
    const url = new URL(String(fetch.mock.calls[1]?.[0]));
    expect(url.searchParams.get("query")).toBe("concise");
    expect(url.searchParams.get("categoryKeys")).toBe("work");
  });
  it("refreshes list and provenance after a mutation and uses the returned detail", async () => {
    const memory = memoryFixture({ title: "Changed" });
    installApiMock([
      { method: "PATCH", path: "/v1/memories/memory-one", response: { memory } }
    ]);
    const { client, wrapper } = queryWrapper();
    const listKey = apiQueryKey(
      testApiUrl,
      queryKeys.memories.list({ page: 1 })
    );
    const provenanceKey = apiQueryKey(
      testApiUrl,
      queryKeys.memories.provenance(memory.id)
    );
    client.setQueryData(listKey, pageFixture([memoryFixture()]));
    client.setQueryData(provenanceKey, { memoryId: memory.id, entries: [] });
    const { result } = renderHook(useMemoryMutations, { wrapper });
    await act(async () => {
      await result.current.update.mutateAsync({
        id: memory.id,
        body: { title: "Changed" }
      });
    });
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(provenanceKey)?.isInvalidated).toBe(true);
    expect(
      client.getQueryData(
        apiQueryKey(testApiUrl, queryKeys.memories.detail(memory.id))
      )
    ).toEqual({ memory });
  });
  it("starts each new draft clean and toggles categories without duplicating them", () => {
    const { result } = renderHook(useMemoryDraft);
    act(() =>
      result.current.startEdit(memoryFixture({ categoryKeys: ["work"] }))
    );
    expect(result.current.draft.title).toBe("Concise answers");
    act(() => result.current.toggleCategory("work"));
    expect(result.current.draft.categoryKeys).toEqual([]);
    act(() => result.current.startCreate());
    expect(result.current.editorMode).toBe("create");
    expect(result.current.draft.title).toBe("");
  });
});
