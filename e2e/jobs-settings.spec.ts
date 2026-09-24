import { expect, test } from "@playwright/test";

const apiBaseUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";

test("daily consolidation switch persists across a page reload", async ({
  page
}) => {
  await page.goto("/vault");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByRole("link", { name: "Choose test account" }).click();

  const endpoint = `${apiBaseUrl}/v1/jobs/consolidation-settings`;
  const originalResponse = await page.request.get(endpoint);
  expect(originalResponse.ok()).toBe(true);
  const original = (await originalResponse.json()) as {
    settings: { enabled: boolean; mode: "REVIEW_ONLY" | "AUTO_APPLY" };
  };

  try {
    const reset = await page.request.patch(endpoint, {
      data: { enabled: false, mode: "REVIEW_ONLY" }
    });
    expect(reset.ok()).toBe(true);

    await page.goto("/settings/jobs");
    const dailySwitch = page.getByRole("switch", {
      name: "Run consolidation daily"
    });
    await expect(dailySwitch).toHaveAttribute("aria-checked", "false");
    await dailySwitch.click();
    await expect(page.getByText("Consolidation settings saved.")).toBeVisible();

    await page.reload();
    await expect(dailySwitch).toHaveAttribute("aria-checked", "true");
  } finally {
    const restore = await page.request.patch(endpoint, {
      data: original.settings
    });
    expect(restore.ok()).toBe(true);
  }
});
