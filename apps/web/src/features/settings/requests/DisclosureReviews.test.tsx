import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { apiFetch } from "../../../lib/api/api-client";
import { ApiProvider } from "../../../lib/api/api-context";
import { apiQueryKey, queryKeys } from "../../../lib/api/query-keys";
import { queryWrapper, testApiUrl } from "../../../test/query-wrapper";
import { render } from "../../../test/render";
import { DisclosureReviews } from "./DisclosureReviews";
import { useDisclosureReviews } from "./use-disclosure-reviews";
vi.mock("next/navigation", () => ({ useSearchParams: () => params }));
vi.mock("../../../lib/api/api-client", () => ({
  apiFetch: vi.fn(),
  isAbortError: () => false,
  apiErrorMessage: () => "The preview changed. Refresh it."
}));
const params = new URLSearchParams("requestId=request-1");
const request = {
  id: "request-1",
  clientName: "Review agent",
  task: "Help with code",
  statedPurpose: "<b>Coding_Reason</b>",
  policyId: "policy_1",
  policyVersion: "2026-09-24",
  reason: "confirmation_required",
  retention: "NO_STORAGE",
  thirdPartyProcessors: [],
  status: "NEEDS_USER_APPROVAL",
  createdAt: "2026-09-20T00:00:00Z"
};
const preview = {
  request,
  revision: "revision-1",
  canApprove: true,
  items: [
    {
      memoryId: "one",
      text: "First memory",
      sensitivity: "LOW",
      category: null,
      estimatedTokens: 3
    },
    {
      memoryId: "two",
      text: "Second memory",
      sensitivity: "LOW",
      category: null,
      estimatedTokens: 3
    }
  ]
};
beforeEach(() => {
  vi.mocked(apiFetch).mockImplementation(async (input) =>
    input.method === "PATCH"
      ? { ok: true }
      : input.path.includes("?")
        ? {
            items: [request],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
          }
        : preview
  );
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("approves only the selected previewed memories with its revision", async () => {
  render(
    <ApiProvider apiUrl="http://server">
      <DisclosureReviews />
    </ApiProvider>
  );
  const facts = within(
    await screen.findByRole("region", { name: "Disclosure preview" })
  );
  expect(facts.getByText("Requested by").nextElementSibling?.textContent).toBe(
    "Review agent"
  );
  expect(facts.getByText("Task").nextElementSibling?.textContent).toBe(
    "Help with code"
  );
  expect(facts.getByText("<b>Coding_Reason</b>").tagName).toBe("DD");
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "Second memory" })
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Approve selected once" })
  );
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        body: { action: "approve", revision: "revision-1", memoryIds: ["one"] }
      })
    )
  );
  expect(await screen.findByRole("status")).toBeTruthy();
});
it("removes the stale preview after an approval conflict until refreshed", async () => {
  render(
    <ApiProvider apiUrl="http://server">
      <DisclosureReviews />
    </ApiProvider>
  );
  await screen.findByRole("checkbox", { name: "First memory" });
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("conflict"));
  fireEvent.click(
    screen.getByRole("button", { name: "Approve selected once" })
  );
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("button", { name: "Approve selected once" })
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh requests" }));
  expect(
    await screen.findByRole("checkbox", { name: "First memory" })
  ).toBeTruthy();
});
it("can deny the request without approving any text", async () => {
  render(
    <ApiProvider apiUrl="http://server">
      <DisclosureReviews />
    </ApiProvider>
  );
  fireEvent.click(await screen.findByRole("button", { name: "Deny request" }));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PATCH", body: { action: "deny" } })
    )
  );
});

it("requires explicit refresh when a changed revision would reset an edited selection", async () => {
  const { wrapper, client } = queryWrapper();
  const { result } = renderHook(useDisclosureReviews, { wrapper });
  await waitFor(() =>
    expect(result.current.preview?.revision).toBe("revision-1")
  );
  act(() => result.current.setSelected(["one"]));
  const key = apiQueryKey(testApiUrl, queryKeys.requests.detail(request.id));
  expect(client.getQueryCache().find({ queryKey: key })?.options).toMatchObject(
    { staleTime: Infinity, refetchOnWindowFocus: false }
  );
  act(() => client.setQueryData(key, { ...preview, revision: "revision-2" }));
  await waitFor(() => expect(result.current.preview).toBeUndefined());
  expect(result.current.error).toContain("preview changed");
  await act(() => result.current.decide("approve"));
  expect(apiFetch).not.toHaveBeenCalledWith(
    expect.objectContaining({ method: "PATCH" })
  );
  vi.mocked(apiFetch).mockImplementation(async (input) =>
    input.path.includes("?")
      ? { items: [request] }
      : { ...preview, revision: "revision-2" }
  );
  await act(() => result.current.refresh());
  expect(result.current.preview?.revision).toBe("revision-2");
});

it("shows an orphaned request as not evaluated, with separate facts", async () => {
  vi.mocked(apiFetch).mockImplementation(async (input) =>
    input.path.includes("?")
      ? {
          items: [request],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
        }
      : {
          ...preview,
          canApprove: false,
          request: {
            ...request,
            statedPurpose: null,
            policyId: null,
            reason: null
          }
        }
  );
  const { container } = render(
    <ApiProvider apiUrl="http://server">
      <DisclosureReviews />
    </ApiProvider>
  );
  expect(await screen.findByText("Not provided")).toBeTruthy();
  expect(screen.getByText("Not evaluated")).toBeTruthy();
  expect(screen.queryByText("Allowed")).toBeNull();
  for (const fact of container.querySelectorAll("dl.memory-facts > div")) {
    expect(fact.querySelectorAll("dt")).toHaveLength(1);
  }
});
