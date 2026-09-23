import type { Client } from "@funes-vault/shared";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "../../../lib/api/api-context";
import { render } from "../../../test/render";
import { AppsAccessPanel } from "./AppsAccess";

const approvedClient: Client = {
  id: "client_a",
  name: "Desktop agent",
  type: "MCP_CLIENT",
  trustLevel: "APPROVED",
  declaredRetention: "NO_STORAGE",
  hasToken: true,
  policyCount: 0,
  oauthConnector: false,
  lastUsedAt: null,
  createdAt: "2026-07-09T12:00:00.000Z",
  updatedAt: "2026-07-09T12:00:00.000Z"
};

const unknownClient: Client = {
  ...approvedClient,
  id: "client_u",
  name: "Pending agent",
  trustLevel: "UNKNOWN"
};

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function installFetch(clients: Client[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/.well-known/")) {
        return json({}, 404);
      }
      if (url.includes("/v1/policies?")) {
        return json({
          items: [],
          pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
        });
      }
      if (url.includes("/v1/clients/client_a") && init?.method === "PATCH") {
        return json({ client: approvedClient, token: "token-shown-once" });
      }
      if (url.includes("/v1/clients?")) {
        return json({
          items: clients,
          pagination: {
            page: 1,
            limit: 25,
            total: clients.length,
            totalPages: clients.length > 0 ? 1 : 0
          }
        });
      }

      return json({});
    })
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppsAccessPanel Signals rows", () => {
  it("expands the connection guide in the zero state", async () => {
    installFetch([]);
    const { container } = render(
      <ApiProvider apiUrl="http://localhost:4000">
        <AppsAccessPanel categories={[]} />
      </ApiProvider>
    );
    expect(
      await screen.findByText(
        "No apps yet. Connect one to start sharing memory on your terms."
      )
    ).toBeTruthy();
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(true);
  });

  it("puts requested clients first and exposes approve and block actions", async () => {
    installFetch([approvedClient, unknownClient]);
    render(
      <ApiProvider apiUrl="http://localhost:4000">
        <AppsAccessPanel categories={[]} />
      </ApiProvider>
    );
    expect(await screen.findByText("Pending agent")).toBeTruthy();
    const rows = screen.getAllByRole("article");
    expect(rows[0]?.textContent).toContain("Pending agent");
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Block" })).toBeTruthy();
  });

  it("keeps a 120-character app name available while the row can truncate it", async () => {
    const longName = "A".repeat(120);
    installFetch([{ ...approvedClient, name: longName }]);
    render(
      <ApiProvider apiUrl="http://localhost:4000">
        <AppsAccessPanel categories={[]} />
      </ApiProvider>
    );

    const name = await screen.findByText(longName);
    expect(name.tagName).toBe("STRONG");
    expect(name.getAttribute("title")).toBe(longName);
    expect(name.closest(".client-row-line")).not.toBeNull();
  });

  it("keeps one editor open and drops a revealed token on collapse", async () => {
    const secondClient = {
      ...approvedClient,
      id: "client_b",
      name: "Second agent"
    };
    installFetch([approvedClient, secondClient]);
    render(
      <ApiProvider apiUrl="http://localhost:4000">
        <AppsAccessPanel categories={[]} />
      </ApiProvider>
    );
    await screen.findByText("Desktop agent");

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    fireEvent.click(editButtons[0]!);
    expect(await screen.findByDisplayValue("Desktop agent")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(await screen.findByDisplayValue("Second agent")).toBeTruthy();
    expect(screen.queryByDisplayValue("Desktop agent")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    await screen.findByDisplayValue("Desktop agent");
    fireEvent.click(screen.getByRole("button", { name: "Rotate token" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Rotate token" }).at(-1)!
    );
    expect(await screen.findByText("token-shown-once")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByText("token-shown-once")).toBeNull()
    );
  });
});

it("renders list policy summaries without requesting policies for each row", async () => {
  installFetch([
    {
      ...approvedClient,
      policyCount: 1,
      policySummary: {
        maxSensitivity: "LOW",
        allowedCategoryKeys: ["work"],
        requiresConfirmation: true
      }
    },
    unknownClient
  ]);
  render(
    <ApiProvider apiUrl="http://localhost:4000">
      <AppsAccessPanel categories={[]} />
    </ApiProvider>
  );
  expect(await screen.findByText(/reads up to Low, 1 category/)).toBeTruthy();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("/v1/policies"))
  ).toHaveLength(0);
});
