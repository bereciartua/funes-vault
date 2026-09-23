import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installApiMock } from "../../test/api-mock";
import { pageFixture } from "../../test/fixtures/memory";
import { suggestionFixture } from "../../test/fixtures/suggestion";
import { queryWrapper } from "../../test/query-wrapper";
import { render } from "../../test/render";
import { InboxPage } from "./InboxPage";
afterEach(() => vi.unstubAllGlobals());
describe("bulk suggestion review", () => {
  it("confirms selected suggestions, refreshes successful rows, and retains failed selections", async () => {
    let reviewed = false;
    const first = suggestionFixture("one", "First fact"),
      second = suggestionFixture("two", "Second fact");
    const fetch = installApiMock([
      {
        path: "/v1/memory-suggestions",
        response: () => pageFixture(reviewed ? [second] : [first, second])
      },
      {
        method: "PATCH",
        path: "/v1/memory-suggestions/review",
        response: () => {
          reviewed = true;

          return {
            action: "apply",
            requested: 2,
            succeeded: 1,
            failed: 1,
            results: [
              { id: "one", status: "applied" },
              { id: "two", status: "failed", error: "Already reviewed" }
            ]
          };
        }
      }
    ]);
    render(<InboxPage />, { wrapper: queryWrapper().wrapper });
    await screen.findByRole("checkbox", { name: "First fact" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select page" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply selected" }));
    await screen.findByRole("alertdialog", { name: "Apply 2 suggestions?" });
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(
      false
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply all selected" }));
    await screen.findByText("Applied 1 suggestion.");
    await waitFor(() =>
      expect(screen.queryByRole("checkbox", { name: "First fact" })).toBeNull()
    );
    expect(
      screen
        .getByRole("checkbox", { name: "Second fact" })
        .getAttribute("aria-checked")
    ).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain(
      "1 suggestion could not be reviewed"
    );
    const request = fetch.mock.calls.find(
      ([, init]) => init?.method === "PATCH"
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      ids: ["one", "two"],
      action: "apply"
    });
  });
});
