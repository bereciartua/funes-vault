import type { AuthUser, OverviewResponse } from "@funes-vault/shared";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { render } from "../../test/render";
import { greetingForHour } from "./home-surface-helpers";
import { HomeSurface } from "./HomeSurface";

const user: AuthUser = {
  id: "u1",
  email: "a@example.com",
  displayName: "Ada",
  role: "USER"
};
const overview = {
  memoryTotal: 12,
  memorySensitivityCounts: [{ sensitivity: "PUBLIC", count: 12 }],
  recentHighSensitivityMemory: null,
  clientTotal: 1,
  clientTrustCounts: [{ trustLevel: "APPROVED", count: 1 }],
  policyTotal: 0,
  categoryTotal: 0,
  broadestPolicy: null,
  suggestionTotal: 2,
  oldestPendingSuggestionAt: null,
  captureSeries: Array.from({ length: 30 }, (_, index) => ({
    date: `2026-06-${String(index + 1).padStart(2, "0")}`,
    count: index % 3
  })),
  lastCapturedAt: null,
  auditTotal: 0,
  recentAuditEvents: []
} as OverviewResponse;

afterEach(cleanup);

describe("HomeSurface", () => {
  it("uses the documented greeting boundaries", () => {
    expect(greetingForHour(4)).toBe("evening");
    expect(greetingForHour(5)).toBe("morning");
    expect(greetingForHour(11)).toBe("morning");
    expect(greetingForHour(12)).toBe("afternoon");
    expect(greetingForHour(17)).toBe("afternoon");
    expect(greetingForHour(18)).toBe("evening");
  });

  it("renders the composer, three signals, and pending review footer", () => {
    render(
      <HomeSurface
        overview={overview}
        user={user}
        error={null}
        onStartChat={async () => undefined}
        onStartVoice={() => undefined}
      />
    );
    expect(screen.getByText(/What should I remember/)).toBeTruthy();
    expect(
      screen.getByText(/^Good (morning|afternoon|evening), Ada\.$/)
    ).toBeTruthy();
    expect(screen.getByText("What should I remember?")).toBeTruthy();
    expect(
      screen
        .getAllByRole("link")
        .filter((link) =>
          ["/vault", "/settings/clients", "/overview"].includes(
            link.getAttribute("href") ?? ""
          )
        )
    ).toHaveLength(3);
    expect(screen.getByText(/2 suggestions waiting for review/)).toBeTruthy();
  });

  it("omits the zero-suggestion clause", () => {
    render(
      <HomeSurface
        overview={{ ...overview, suggestionTotal: 0 }}
        user={user}
        error={null}
        onStartChat={async () => undefined}
        onStartVoice={() => undefined}
      />
    );
    expect(screen.queryByText(/waiting for review/)).toBeNull();
  });
});
