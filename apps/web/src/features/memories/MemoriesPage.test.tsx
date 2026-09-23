import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installApiMock } from "../../test/api-mock";
import { memoryFixture, pageFixture } from "../../test/fixtures/memory";
import { queryWrapper } from "../../test/query-wrapper";
import { render } from "../../test/render";
import { MemoriesPage } from "./MemoriesPage";
const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  params: new URLSearchParams()
}));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => navigation.params
}));
afterEach(() => {
  vi.unstubAllGlobals();
  navigation.push.mockReset();
  navigation.params = new URLSearchParams();
});
describe("memories surface", () => {
  it("renders a selected memory from its URL and saves an edited title", async () => {
    const memory = memoryFixture();
    navigation.params = new URLSearchParams({ memoryId: memory.id });
    let saved = memory;
    const fetch = installApiMock([
      { path: "/v1/categories", response: { items: [] } },
      { path: "/v1/memories", response: () => pageFixture([saved]) },
      {
        path: `/v1/memories/${memory.id}`,
        response: () => ({ memory: saved })
      },
      {
        path: `/v1/memories/${memory.id}/provenance`,
        response: { memoryId: memory.id, entries: [] }
      },
      {
        method: "PATCH",
        path: `/v1/memories/${memory.id}`,
        response: () => {
          saved = { ...memory, title: "Short answers" };

          return { memory: saved };
        }
      }
    ]);
    const { wrapper } = queryWrapper();
    render(<MemoriesPage />, { wrapper });
    await screen.findByRole("heading", { name: "Concise answers" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Short answers" }
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await screen.findByText("Memory updated.");
    expect(
      fetch.mock.calls.some(
        ([, init]) =>
          init?.method === "PATCH" &&
          String(init.body).includes("Short answers")
      )
    ).toBe(true);
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        `/vault?memoryId=${memory.id}`
      )
    );
  });
});
