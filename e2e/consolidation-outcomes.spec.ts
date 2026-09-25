import { expect, test } from "@playwright/test";

const apiUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";
const now = "2026-09-24T18:43:19.000Z";
const completed = {
  id: "synthetic-completed",
  type: "CONSOLIDATE_MEMORIES",
  status: "SUCCEEDED",
  attempts: 1,
  maxAttempts: 3,
  createdAt: now,
  updatedAt: now,
  startedAt: now,
  finishedAt: now,
  error: null,
  metadata: {
    semantic: {
      status: "completed",
      maxSensitivity: "INTERNAL",
      skippedSources: 6,
      skippedPairs: 0,
      skippedSourceReasons: { above_sensitivity_limit: 6 }
    }
  },
  consolidation: {
    trigger: "manual",
    mode: "REVIEW_ONLY",
    inspectedMemoryCount: 19,
    recentMemoryCount: 19,
    expiredMemoryCount: 0,
    candidateCount: 0,
    suggestionsCreated: 0,
    actionsAutoApplied: 0,
    noActionPairs: 19,
    actions: []
  }
};

test("consolidation explains expected exclusions and real failures", async ({
  page
}) => {
  const failures = [
    {
      ...completed,
      id: "synthetic-outage",
      status: "FAILED",
      error: "Memory comparison could not finish. You can retry this run.",
      metadata: {
        semantic: { status: "failed", reason: "provider_unavailable" }
      }
    },
    {
      ...completed,
      id: "synthetic-consent",
      status: "FAILED",
      error: "Processing permission required",
      metadata: {
        semantic: { status: "skipped", reason: "processing_consent_required" }
      }
    }
  ];
  await page.route(`${apiUrl}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path === "/auth/me") {
      body = {
        user: {
          id: "synthetic-owner",
          email: "owner@example.com",
          displayName: "Test owner",
          role: "OWNER"
        }
      };
    } else if (path === "/v1/jobs/consolidation-settings") {
      body = { settings: { enabled: true, mode: "REVIEW_ONLY" } };
    } else if (path === "/v1/jobs") {
      body = {
        items: [completed, ...failures],
        pagination: { page: 1, limit: 20, total: 3, totalPages: 1 }
      };
    } else if (path === "/health") {
      body = { status: "ok", service: "synthetic-api", timestamp: now };
    } else {
      await route.fulfill({
        status: 404,
        json: { message: "Not part of this synthetic fixture" }
      });

      return;
    }
    await route.fulfill({ json: body });
  });
  await page.goto("/settings/jobs");
  await expect(
    page.getByText("Consolidation completed · 6 memories skipped")
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Details", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("6 above the sensitivity limit for memory comparison.")
  ).toBeVisible();
  await expect(page.getByText(/No retry is needed/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true })
  ).toHaveCount(0);
  await expect(page.getByText("19 pairs unchanged")).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Details", exact: true })
    .nth(1)
    .click();
  await expect(
    page.getByText(/Memory comparison could not finish/)
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Details", exact: true })
    .nth(2)
    .click();
  await expect(page.getByText(/Settings → Profile/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true })
  ).toHaveCount(0);
});
