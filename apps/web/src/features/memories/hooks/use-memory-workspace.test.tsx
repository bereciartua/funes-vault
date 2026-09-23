import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installApiMock } from "../../../test/api-mock";
import { memoryFixture, pageFixture } from "../../../test/fixtures/memory";
import { queryWrapper } from "../../../test/query-wrapper";
import { useMemoryWorkspace } from "./use-memory-workspace";
const navigation = vi.hoisted(() => ({ push: vi.fn(), selected: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.selected)
}));
afterEach(() => {
  navigation.selected = "";
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("memory workspace", () => {
  it("resets pagination when filters change and closes drafts when navigating to a memory", async () => {
    const memory = memoryFixture();
    const fetch = installApiMock([
      {
        path: "/v1/memories",
        response: ({ url }: { url: URL }) =>
          pageFixture([memory], Number(url.searchParams.get("page")))
      },
      { path: "/v1/categories", response: { items: [] } }
    ]);
    const { result } = renderHook(useMemoryWorkspace, {
      wrapper: queryWrapper().wrapper
    });
    await waitFor(() => expect(result.current.list.isLoading).toBe(false));
    act(() => result.current.pagination.changeMemoryPage(3));
    await waitFor(() =>
      expect(result.current.pagination.memoryPagination.page).toBe(3)
    );
    act(() =>
      result.current.filters.updateFilters((current) => ({
        ...current,
        sensitivity: "RESTRICTED"
      }))
    );
    await waitFor(() =>
      expect(result.current.pagination.memoryPagination.page).toBe(1)
    );
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).includes("sensitivity=RESTRICTED")
      )
    ).toBe(true);
    act(() => result.current.startCreate());
    expect(navigation.push).toHaveBeenLastCalledWith("/vault");
    act(() => result.current.list.selectMemory(memory));
    expect(navigation.push).toHaveBeenLastCalledWith(
      `/vault?memoryId=${memory.id}`
    );
  });
});

it("binds an edit to its original memory, closes on URL navigation, and preserves source metadata", async () => {
  const a = memoryFixture({
    id: "a",
    source: {
      type: "IMPORT",
      clientId: null,
      uri: null,
      metadata: { imported: "origin" }
    }
  });
  const b = memoryFixture({ id: "b" });
  navigation.selected = "memoryId=a";
  const fetch = installApiMock([
    { path: "/v1/memories", response: pageFixture([a, b]) },
    { path: "/v1/categories", response: { items: [] } },
    { path: "/v1/memories/a", response: { memory: a } },
    { path: "/v1/memories/b", response: { memory: b } },
    { method: "PATCH", path: "/v1/memories/a", response: { memory: a } }
  ]);
  const { result, rerender } = renderHook(useMemoryWorkspace, {
    wrapper: queryWrapper().wrapper
  });
  await waitFor(() =>
    expect(result.current.detail.selectedMemory?.id).toBe("a")
  );
  act(() => result.current.detail.startEdit());
  const saveOriginalDraft = result.current.editor.saveMemory;
  navigation.selected = "memoryId=b";
  rerender();
  await waitFor(() => expect(result.current.editor.editorMode).toBe("closed"));
  // Even a save callback already queued before navigation must never write B.
  await act(async () =>
    saveOriginalDraft({
      preventDefault() {}
    } as React.FormEvent<HTMLFormElement>)
  );
  const patch = fetch.mock.calls.find(([, init]) => init?.method === "PATCH");
  expect(String(patch?.[0])).toBe("http://vault.test/v1/memories/a");
  expect(JSON.parse(String(patch?.[1]?.body))).not.toHaveProperty(
    "sourceMetadata"
  );
});
