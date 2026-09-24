import {
  type Client,
  type Policy,
  webChatClientName
} from "@funes-vault/shared";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ConfirmationProvider } from "../../../components/ui/confirmation-dialog";
import { ApiProvider } from "../../../lib/api/api-context";
import { policySummary } from "../../../lib/domain/policy-summary";
import { render } from "../../../test/render";
import { AppsAccessPanel } from "./AppsAccess";
import { PolicyList } from "./PolicyList";
const app: Client = {
  id: "app",
  name: "Connected app",
  type: "MCP_CLIENT",
  trustLevel: "APPROVED",
  declaredRetention: "UNKNOWN",
  hasToken: true,
  hasPolicy: false,
  oauthConnector: false,
  lastUsedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
};
const policy: Policy = {
  id: "permission",
  clientId: app.id,
  clientName: app.name,
  maxSensitivity: "LOW",
  operations: ["READ", "WRITE"],
  allowedCategoryKeys: [],
  deniedCategoryKeys: [],
  expiresAt: null,
  requiresConfirmation: false,
  createdAt: app.createdAt,
  updatedAt: app.updatedAt
};
const pagination = { page: 1, limit: 50, total: 1, totalPages: 1 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([
  [false, false, true],
  [true, false, false],
  [false, true, false]
])(
  "shows the immediate-write warning only with applicable permissions (%s, %s)",
  (confirmation, firstParty, visible) => {
    expect(
      policySummary(
        { ...policy, requiresConfirmation: confirmation },
        firstParty
      ).includes("applied immediately")
    ).toBe(visible);
    expect(policySummary(policy)).toContain("every category");
  }
);
it("matches the visible remove button name", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ items: [policy], pagination }))
  );
  render(
    <ApiProvider apiUrl="http://vault.test">
      <ConfirmationProvider>
        <PolicyList client={app} categories={[]} />
      </ConfirmationProvider>
    </ApiProvider>
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit permissions" })
  );
  const remove = screen.getByRole("button", { name: "Remove permissions" });
  expect(remove.textContent).toBe("Remove permissions");
  expect(
    screen.queryByRole("button", { name: "Restore default permissions" })
  ).toBeNull();
});
it("hides Restore for a connected app with no permissions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({ items: [], pagination: { ...pagination, total: 0 } })
    )
  );
  render(
    <ApiProvider apiUrl="http://vault.test">
      <PolicyList client={app} categories={[]} />
    </ApiProvider>
  );
  expect(
    await screen.findByRole("button", { name: "Set up permissions" })
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Restore default permissions" })
  ).toBeNull();
});
it("closes a raced create editor and reloads both client and permission queries", async () => {
  let raced = false;
  let clientReads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/.well-known/")) {
        return json({}, 404);
      }
      if (url.endsWith("/v1/policies") && init?.method === "POST") {
        raced = true;

        return json({ message: "This app already has permissions" }, 409);
      }
      if (url.includes("/v1/policies?")) {
        return json({ items: raced ? [policy] : [], pagination });
      }
      if (url.includes("/v1/clients?")) {
        clientReads++;

        return json({ items: [{ ...app, hasPolicy: raced }], pagination });
      }

      return json({});
    })
  );
  render(
    <ApiProvider apiUrl="http://vault.test">
      <AppsAccessPanel categories={[]} />
    </ApiProvider>
  );
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Set up permissions" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  await screen.findByRole("button", { name: "Edit permissions" });
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull()
  );
  expect(clientReads).toBeGreaterThan(1);
  expect(await screen.findByText(/App permissions configured/)).toBeTruthy();
});
it("restores first-party defaults and closes an open create form", async () => {
  let restored = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        restored = true;

        return json({ policy });
      }

      return json({ items: restored ? [policy] : [], pagination });
    })
  );
  render(
    <ApiProvider apiUrl="http://vault.test">
      <ConfirmationProvider>
        <PolicyList
          client={{ ...app, type: "WEB_APP", name: webChatClientName }}
          categories={[]}
        />
      </ConfirmationProvider>
    </ApiProvider>
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Set up permissions" })
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Restore default permissions" })
  );
  await screen.findByText("Default permissions restored.");
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
});
