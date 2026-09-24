import { expect, test } from "@playwright/test";
const api = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";

test("sets up, edits and removes one app permission set, then restores first-party defaults", async ({
  page
}) => {
  await page.goto("/vault");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  const login = new URL(
    (await page
      .getByRole("link", { name: "Choose test account", exact: true })
      .getAttribute("href"))!
  );
  login.searchParams.set("code", `test-permissions-${Date.now()}@example.test`);
  await page.goto(login.href);
  const name = `Permissions test ${Date.now()}`;
  const created = await page.request.post(`${api}/v1/clients`, {
    data: { name, type: "MCP_CLIENT", trustLevel: "APPROVED" }
  });
  expect(created.ok()).toBe(true);
  const { client } = await created.json();
  await page.goto("/settings/clients");
  await page
    .locator("article.client-feed-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByRole("button", { name: "Set up permissions" }).click();
  await expect(page.getByLabel("Policy purpose")).toHaveCount(0);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("Permissions created.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Set up permissions" })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit permissions" }).click();
  await page.getByRole("checkbox", { name: "Write", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "Ask me before each disclosure" })
    .uncheck();
  await expect(
    page.getByText(/Proposals from this app are applied immediately/).first()
  ).toBeVisible();
  await page
    .getByRole("region", { name: "App permissions" })
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByText("Permissions updated.")).toBeVisible();
  const saved = (
    await (
      await page.request.get(`${api}/v1/policies?clientId=${client.id}`)
    ).json()
  ).items;
  expect(saved).toHaveLength(1);
  expect(saved[0].operations).toContain("WRITE");
  await page.getByRole("button", { name: "Edit permissions" }).click();
  await page
    .getByRole("button", { name: "Remove permissions", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove permissions" })
    .click();
  await expect(page.getByText("Permissions removed.")).toBeVisible();
  expect(
    (
      await (
        await page.request.get(`${api}/v1/policies?clientId=${client.id}`)
      ).json()
    ).items
  ).toHaveLength(0);

  const clients = (await (await page.request.get(`${api}/v1/clients`)).json())
    .items;
  const chat = clients.find(
    (item: { name: string }) => item.name === "Funes Vault Web Chat"
  );
  expect(chat).toBeTruthy();
  const policies = (
    await (
      await page.request.get(`${api}/v1/policies?clientId=${chat.id}`)
    ).json()
  ).items;
  expect(policies).toHaveLength(1);
  expect(
    (await page.request.delete(`${api}/v1/policies/${policies[0].id}`)).ok()
  ).toBe(true);
  await page.reload();
  await page
    .locator("article.client-feed-row")
    .filter({ hasText: "Funes Vault Web Chat" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore default permissions" })
    .click();
  await expect(page.getByText("Default permissions restored.")).toBeVisible();
  const restored = (
    await (
      await page.request.get(`${api}/v1/policies?clientId=${chat.id}`)
    ).json()
  ).items;
  expect(restored).toHaveLength(1);
  expect(restored[0]).toMatchObject({
    clientId: chat.id,
    operations: ["READ", "SUGGEST", "WRITE"],
    maxSensitivity: "SECRET"
  });
});
