import type { AuditEvent } from "@funes-vault/shared";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "../../../lib/api/api-context";
import { render } from "../../../test/render";
import { AuditPanel } from "./AuditLog";

const navigation = vi.hoisted(() => ({ params: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.params)
}));

const deletedEvent: AuditEvent = {
  id: "audit_1",
  type: "MEMORY_DELETED",
  actorType: "USER",
  actorId: "user_1",
  clientId: null,
  clientName: null,
  memoryRequestId: null,
  metadata: {},
  subjects: [
    {
      type: "MEMORY",
      id: "memory_1",
      role: "TARGET",
      label: "Old preference",
      metadata: {}
    }
  ],
  createdAt: "2026-07-10T15:19:00.000Z"
};

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

afterEach(() => {
  navigation.params = "";
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuditPanel Signals feed", () => {
  it("uses a danger dot, links subjects, and omits empty metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/v1/clients/options")) {
          return json({ items: [] });
        }
        if (url.endsWith("/v1/audit-events/audit_1")) {
          return json({ auditEvent: deletedEvent });
        }

        return json({
          items: [deletedEvent],
          pagination: { page: 1, limit: 25, total: 1, totalPages: 1 }
        });
      })
    );

    render(
      <ApiProvider apiUrl="http://localhost:4000">
        <AuditPanel />
      </ApiProvider>
    );
    const subject = await screen.findByRole("link", {
      name: "Old preference"
    });
    expect(subject.getAttribute("href")).toContain("memoryId=memory_1");
    expect(screen.getByText(/You deleted/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(await screen.findByText("Performed by you.")).toBeTruthy();
    expect(screen.queryByText("Raw metadata")).toBeNull();
  });

  it("offers to clear filters when a selected filter has no results", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => undefined;
    Element.prototype.releasePointerCapture ??= () => undefined;
    HTMLElement.prototype.scrollIntoView ??= () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/v1/clients/options")) {
          return json({ items: [] });
        }
        if (url.includes("type=MEMORY_CREATED")) {
          return json({
            items: [],
            pagination: { page: 1, limit: 25, total: 0, totalPages: 0 }
          });
        }

        return json({
          items: [deletedEvent],
          pagination: { page: 1, limit: 25, total: 1, totalPages: 1 }
        });
      })
    );

    render(
      <ApiProvider apiUrl="http://localhost:4000">
        <AuditPanel />
      </ApiProvider>
    );
    await screen.findByText("Old preference");
    const eventFilter = screen.getByRole("combobox", {
      name: "Audit event filter"
    });
    const nativeSelect = eventFilter.parentElement?.querySelector("select");
    expect(nativeSelect).not.toBeNull();
    fireEvent.change(nativeSelect!, { target: { value: "MEMORY_CREATED" } });

    expect(
      await screen.findByText("No events match these filters.")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Old preference")).toBeTruthy();
  });
});

it("opens a directly linked event even when it is outside the current history page", async () => {
  navigation.params = "eventId=audit_1";
  const fetch = vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith("/v1/audit-events/audit_1")
      ? json({ auditEvent: deletedEvent })
      : json({
          items: [],
          pagination: { page: 1, limit: 25, total: 0, totalPages: 0 }
        })
  );
  vi.stubGlobal("fetch", fetch);
  render(
    <ApiProvider apiUrl="http://localhost:4000">
      <AuditPanel />
    </ApiProvider>
  );
  expect(await screen.findByText("Performed by you.")).toBeTruthy();
  expect(
    screen.getByRole("region", { name: "Linked audit event" })
  ).toBeTruthy();
});
