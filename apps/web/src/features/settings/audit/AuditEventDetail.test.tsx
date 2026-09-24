import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { render } from "../../../test/render";
import { AuditEventDetail } from "./AuditEventDetail";
import { useAuditDetail } from "./use-audit";
vi.mock("./use-audit", () => ({ useAuditDetail: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it.each(["purpose", "statedPurpose"])(
  "renders %s as literal text and omits facts the event did not record",
  (key) => {
    vi.mocked(useAuditDetail).mockReturnValue({
      isPending: false,
      error: null,
      data: {
        auditEvent: {
          id: "event",
          type: "MEMORY_DISCLOSURE",
          actorType: "CLIENT",
          actorId: "app",
          clientName: "App",
          memoryRequestId: "request",
          createdAt: "2026-01-01T00:00:00Z",
          subjects: [],
          metadata: { [key]: "<b>My_Reason</b>", reason: "no_client_policy" }
        }
      }
    } as unknown as ReturnType<typeof useAuditDetail>);
    const { container } = render(<AuditEventDetail eventId="event" />);
    expect(screen.getByText("<b>My_Reason</b>").tagName).toBe("DD");
    expect(container.querySelectorAll("dl > dt")).toHaveLength(0);
    expect(screen.queryByText("Task")).toBeNull();
    expect(screen.queryByText("Confirmation required")).toBeNull();
    expect(screen.getByText(/This app has no permissions/)).toBeTruthy();
  }
);
it("shows Not provided for an explicitly null purpose", () => {
  vi.mocked(useAuditDetail).mockReturnValue({
    isPending: false,
    error: null,
    data: {
      auditEvent: {
        id: "event",
        type: "MEMORY_SUGGESTION_CREATED",
        actorType: "USER",
        createdAt: "2026-01-01T00:00:00Z",
        subjects: [],
        metadata: { statedPurpose: null }
      }
    }
  } as unknown as ReturnType<typeof useAuditDetail>);
  render(<AuditEventDetail eventId="event" />);
  expect(screen.getByText("Not provided")).toBeTruthy();
});
