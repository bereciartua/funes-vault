import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installApiMock } from "../../../test/api-mock";
import { queryWrapper } from "../../../test/query-wrapper";
import { render } from "../../../test/render";
import { DataControl } from "./DataControl";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("verified=1")
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("independent data controls", () => {
  it("rejects malformed import JSON without contacting the server", async () => {
    const fetch = installApiMock([]);
    render(<DataControl categories={[]} />, {
      wrapper: queryWrapper().wrapper
    });
    fireEvent.change(screen.getByLabelText("JSON"), {
      target: { value: "{bad" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Import file must be valid JSON."
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps export available while an import preview is pending and resets preview after edits", async () => {
    let resolve: ((value: unknown) => void) | undefined;
    installApiMock([
      {
        method: "POST",
        path: "/v1/data/import/preview",
        response: () =>
          new Promise((done) => {
            resolve = done;
          })
      }
    ]);
    render(<DataControl categories={[]} />, {
      wrapper: queryWrapper().wrapper
    });
    fireEvent.change(screen.getByLabelText("JSON"), {
      target: { value: "{}" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Preview" }).hasAttribute("disabled")
      ).toBe(true)
    );
    expect(
      screen.getByRole("button", { name: "Download" }).hasAttribute("disabled")
    ).toBe(false);
    resolve?.({
      preview: {
        schemaVersion: "funes-vault.export.v2",
        exportedAt: "2026-09-22T00:00:00.000Z",
        memories: 1,
        archivedMemories: 0,
        categories: 0,
        clients: 0,
        policies: 0,
        auditEvents: 0,
        possibleDuplicateMemories: [],
        categoryKeys: []
      }
    });
    await screen.findByText("Preview ready for 1 memory.");
    expect(
      screen.getByRole("button", { name: "Import" }).hasAttribute("disabled")
    ).toBe(false);
    fireEvent.change(screen.getByLabelText("JSON"), {
      target: { value: '{"changed":true}' }
    });
    expect(
      screen.getByRole("button", { name: "Import" }).hasAttribute("disabled")
    ).toBe(true);
  });
  it("requires the exact deletion phrase and an explicit confirmation", async () => {
    const fetch = installApiMock([]);
    render(<DataControl categories={[]} />, {
      wrapper: queryWrapper().wrapper
    });
    const zone = screen.getByRole("region", { name: "Danger zone" });
    expect(
      within(zone)
        .getByRole("button", { name: "Delete" })
        .hasAttribute("disabled")
    ).toBe(true);
    fireEvent.change(within(zone).getByRole("textbox"), {
      target: { value: "DELETE" }
    });
    fireEvent.click(within(zone).getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog", { name: "Delete your account?" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen.getByText(/verified. Confirm deletion within five minutes/)
    ).toBeTruthy();
  });
});
