import type { OverviewResponse } from "@funes-vault/shared";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { render } from "../../test/render";
import { PrivacyOverview } from "./OverviewSurface";
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
} satisfies OverviewResponse;

afterEach(cleanup);
it.each([true, false])(
  "uses the first-party flag in the permission summary: %s",
  (firstParty) => {
    render(
      <PrivacyOverview
        providerNotice={null}
        overview={{
          ...overview,
          broadestPolicy: {
            id: "policy",
            clientId: "client",
            clientName: "App",
            firstParty,
            allowedCategoryKeys: [],
            deniedCategoryKeys: [],
            maxSensitivity: "SECRET",
            operations: ["READ", "WRITE"],
            requiresConfirmation: false,
            expiresAt: null,
            createdAt: "2026-09-24T00:00:00Z",
            updatedAt: "2026-09-24T00:00:00Z"
          }
        }}
      />
    );
    expect(
      Boolean(
        screen.queryByText(/Proposals from this app are applied immediately/)
      )
    ).toBe(!firstParty);
  }
);
