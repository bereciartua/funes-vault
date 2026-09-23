import { expect, test } from "@playwright/test";
const api = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";

test("offers only Google sign-in and recovers from a canceled authorization", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Continue with Google" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use demo account" })
  ).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("link", { name: "Continue with Google" })
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Account access" }).getByRole("alert")
  ).toContainText("Google sign-in was canceled");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page
    .getByRole("link", { name: "Choose test account", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Application navigation" })
  ).toBeVisible();
  await page.goto("/settings/profile");
  await expect(
    page.getByText("Your account uses Google sign-in.")
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("requires a Google identity check and explicit confirmation to delete an account", async ({
  page
}) => {
  await page.goto("/settings/data");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page
    .getByRole("link", { name: "Choose deletion test account" })
    .click();
  await expect(page).toHaveURL(/\/settings\/data$/);
  const danger = page.getByRole("region", { name: "Danger zone" });
  await expect(
    danger.getByRole("button", { name: "Delete", exact: true })
  ).toBeDisabled();
  await danger.getByRole("link", { name: "Verify Google account" }).click();
  await page
    .getByRole("link", { name: "Choose test account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/data\?authError=google$/);
  await expect(
    page.getByText(/Google verification was canceled or failed/)
  ).toBeVisible();
  await danger.getByRole("link", { name: "Verify Google account" }).click();
  await page
    .getByRole("link", { name: "Choose deletion test account" })
    .click();
  await expect(page).toHaveURL(/\/settings\/data\?verified=1$/);
  await expect(
    page.getByText(
      "Google account verified. Confirm deletion within five minutes."
    )
  ).toBeVisible();
  expect((await page.request.get(`${api}/auth/me`)).status()).toBe(200);
  await danger.getByLabel("Type DELETE to confirm").fill("DELETE");
  await danger.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete everything", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your AI memory, under your control." })
  ).toBeVisible();
  expect((await page.request.get(`${api}/auth/me`)).status()).toBe(401);
});
