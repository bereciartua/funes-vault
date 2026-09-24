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

it.each([
  "MEMORY_DISCLOSURE",
  "MEMORY_REQUEST_APPROVED",
  "MEMORY_REQUEST_DENIED"
] as const)("omits a null reason for evaluated %s events", (type) => {
  vi.mocked(useAuditDetail).mockReturnValue({
    isPending: false,
    error: null,
    data: {
      auditEvent: {
        id: "event",
        type,
        actorType: type === "MEMORY_DISCLOSURE" ? "CLIENT" : "USER",
        createdAt: "2026-01-01T00:00:00Z",
        subjects: [],
        metadata: {
          decision: "ALLOW",
          reason: null,
          policyVersion: "2026-01-01T00:00:00Z",
          requiresConfirmation: false
        }
      }
    }
  } as unknown as ReturnType<typeof useAuditDetail>);
  render(<AuditEventDetail eventId="event" />);
  expect(screen.queryByText("Reason")).toBeNull();
  expect(screen.queryByText("Not evaluated")).toBeNull();
  expect(screen.getByText("Allowed")).toBeTruthy();
  expect(screen.getByText("No")).toBeTruthy();
});
it("does not render empty facts for unrelated metadata", () => {
  vi.mocked(useAuditDetail).mockReturnValue({
    isPending: false,
    error: null,
    data: {
      auditEvent: {
        id: "event",
        type: "JOB_CREATED",
        actorType: "SYSTEM",
        createdAt: "2026-01-01T00:00:00Z",
        subjects: [],
        metadata: { job: "one" }
      }
    }
  } as unknown as ReturnType<typeof useAuditDetail>);
  expect(
    render(<AuditEventDetail eventId="event" />).container.querySelector("dl")
  ).toBeNull();
});
