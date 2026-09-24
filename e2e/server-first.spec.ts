import { expect, type Page, test } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";

test.beforeEach(async ({ page }) => {
  await page.goto("/vault");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByRole("link", { name: "Choose test account" }).click();
  await expect(
    page.getByRole("navigation", { name: "Application navigation" })
  ).toBeVisible();
});

async function createMemory(page: Page, title: string, body: string) {
  const response = await page.request.post(`${api}/v1/memories`, {
    data: {
      kind: "PREFERENCE",
      title,
      body,
      categoryKeys: [],
      sensitivity: "LOW"
    }
  });
  expect(response.ok()).toBeTruthy();

  return (await response.json()).memory.id as string;
}

test("reviews a server disclosure, excludes a memory, and consumes only the approved text", async ({
  page
}) => {
  const subject = process.env.UPDATE_RELEASE_SCREENSHOTS
    ? "Technical collaboration"
    : `serverreview${Date.now()}`;
  const firstTitle = `${subject}: concise answers`;
  const secondTitle = `${subject}: planning`;
  const first = await createMemory(
    page,
    firstTitle,
    "Prefer concise technical explanations with a short rationale and a concrete example."
  );
  const second = await createMemory(
    page,
    secondTitle,
    "Break larger changes into reviewable steps and call out compatibility risks."
  );
  const clientResponse = await page.request.post(`${api}/v1/clients`, {
    data: {
      name: "Coding assistant",
      type: "MCP_CLIENT",
      trustLevel: "APPROVED",
      declaredRetention: "NO_STORAGE"
    }
  });
  expect(clientResponse.ok()).toBeTruthy();
  const client = await clientResponse.json();
  const policy = await page.request.post(`${api}/v1/policies`, {
    data: {
      clientId: client.client.id,

      operations: ["READ"],
      maxSensitivity: "LOW",
      requiresConfirmation: true,
      allowedCategoryKeys: [],
      deniedCategoryKeys: []
    }
  });
  expect(policy.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${client.token}` };
  const requested = await page.request.post(`${api}/v1/memory-requests`, {
    headers,
    data: {
      task: subject,
      retention: "NO_STORAGE"
    }
  });
  const bundle = await requested.json();
  expect(bundle.status).toBe("NEEDS_USER_APPROVAL");
  expect(bundle.items).toEqual([]);
  await page.goto(`/settings/requests?requestId=${bundle.requestId}`);
  await expect(
    page.getByRole("heading", { name: "Sharing requests", exact: true })
  ).toBeVisible();
  const preview = page.getByRole("region", { name: "Disclosure preview" });
  await expect(
    preview.getByRole("checkbox", { name: new RegExp(firstTitle) })
  ).toBeVisible();
  // Semantic retrieval can include other low-sensitivity records; only approve the first.
  const boxes = preview.getByRole("checkbox");
  for (let i = 0; i < (await boxes.count()); i++) {
    const box = boxes.nth(i);
    if (!(await box.locator("..").innerText()).includes(firstTitle)) {
      await box.uncheck();
    }
  }
  if (process.env.UPDATE_RELEASE_SCREENSHOTS) {
    await page.screenshot({
      path: "docs/screenshots/disclosure-review.png",
      fullPage: true
    });
  }
  await page.getByRole("button", { name: "Approve selected once" }).click();
  await expect(page.getByRole("status")).toContainText("Approved once");
  const retrieved = await page.request.get(
    `${api}/v1/memory-requests/${bundle.requestId}/result`,
    { headers }
  );
  const result = await retrieved.json();
  expect(
    result.items.map((item: { memoryId: string }) => item.memoryId)
  ).toEqual([first]);
  expect(
    result.items.some((item: { memoryId: string }) => item.memoryId === second)
  ).toBe(false);
  const repeated = await page.request.get(
    `${api}/v1/memory-requests/${bundle.requestId}/result`,
    { headers }
  );
  expect((await repeated.json()).items).toEqual([]);
  await page.goto("/settings/audit");
  await expect(
    page.getByRole("heading", { name: "Audit log", exact: true })
  ).toBeVisible();
  if (process.env.UPDATE_RELEASE_SCREENSHOTS) {
    await page.goto(`/vault?memoryId=${first}`);
    await expect(
      page.getByRole("button", { name: "Edit", exact: true })
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Memory provenance" })
        .getByText("Created", { exact: true })
    ).toBeVisible();
    await page.screenshot({
      path: "docs/screenshots/vault.png",
      fullPage: true
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByLabel("Ask your vault")).toBeVisible();
    await page.screenshot({
      path: "docs/screenshots/mobile.png",
      fullPage: true
    });
  }
  await page.request.delete(`${api}/v1/clients/${client.client.id}`);
});

test("all retained web surfaces load and phone installation guidance is available", async ({
  page
}) => {
  for (const path of [
    "/",
    "/overview",
    "/vault",
    "/inbox",
    "/chat",
    "/settings/profile",
    "/settings/jobs",
    "/settings/data",
    "/settings/clients",
    "/settings/requests",
    "/settings/audit"
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("navigation", { name: "Application navigation" })
    ).toBeVisible();
    await expect(
      page.getByText("Something went wrong", { exact: true })
    ).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/profile");
  await expect(
    page.getByRole("heading", { name: "Funes on your phone" })
  ).toBeVisible();
  await expect(page.getByText(/Add to Home Screen/)).toBeVisible();
  for (const path of ["/", "/vault", "/inbox", "/chat", "/settings/requests"]) {
    await page.goto(path);
    await expect(
      page.getByRole("navigation", { name: "Application navigation" })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      )
    ).toBe(true);
  }
});

test("exports and previews a portable vault without restoring credentials", async ({
  page
}) => {
  await page.goto("/settings/data");
  const response = await page.request.get(
    `${api}/v1/data/export?includeAuditEvents=true`
  );
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.export.metadata.schemaVersion).toBe("funes-vault.export.v2");
  expect(JSON.stringify(payload)).not.toContain('"tokenHash"');
  const preview = await page.request.post(`${api}/v1/data/import/preview`, {
    data: payload
  });
  expect(preview.ok()).toBeTruthy();
  expect((await preview.json()).preview.memories).toBe(
    payload.export.memories.length
  );
});
