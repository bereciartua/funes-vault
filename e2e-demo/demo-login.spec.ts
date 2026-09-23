import { expect, test } from "@playwright/test";

test("opens the seeded vault with external requests blocked and no Google credentials", async ({
  page
}) => {
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;

    return host === "localhost" || host === "127.0.0.1"
      ? route.continue()
      : route.abort();
  });
  await page.goto("/vault");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Use demo account" })
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Use demo account" }).click();
  await expect(
    page.getByRole("navigation", { name: "Application navigation" })
  ).toBeVisible();
  await expect(
    page.getByText("Privacy should be visible", { exact: true })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Privacy should be visible", { exact: true })
  ).toBeVisible();
  await page.goto("/settings/profile");
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true })
  ).toHaveValue("demo@funes-vault.local");
});
