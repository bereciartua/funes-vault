import { expect, test } from "@playwright/test";
const api = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/vault");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByRole("link", { name: "Choose test account" }).click();
  await expect(
    page.getByRole("navigation", { name: "Application navigation" })
  ).toBeVisible();
}

test("returns sign-in focus and applies a nonce script policy", async ({
  page
}) => {
  const response = await page.goto("/");
  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("'nonce-");
  const script = policy.split(";").find((part) => part.includes("script-src"));
  if (process.env.CI) {
    expect(script).not.toContain("'unsafe-inline'");
  }
  const opener = page.getByRole("button", {
    name: "Create your vault",
    exact: true
  });
  await opener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

test("keeps the closed phone drawer out of keyboard focus", async ({
  page
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chat/new");
  const drawer = page.locator('div[aria-label="Previous chat threads"]');
  await expect(drawer).toHaveAttribute("inert", "");
  await page
    .getByRole("button", { name: "Previous threads", exact: true })
    .click();
  await expect(drawer).not.toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveAttribute("inert", "");
  await expect(
    page.getByRole("button", { name: "Previous threads", exact: true })
  ).toBeFocused();
});

test("keeps device captures private to their authenticated owner", async ({
  page,
  context
}) => {
  await signIn(page);
  const original = await (await page.request.get(`${api}/auth/me`)).json();
  await context.setOffline(true);
  await expect(
    page.getByRole("alert").filter({ hasText: "Vault unreachable" })
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Capture", exact: true })
    .fill("Alice private offline capture");
  await page.getByRole("button", { name: "Queue capture" }).click();
  await expect(
    page.getByText("Alice private offline capture", { exact: true })
  ).toBeVisible();
  const databases = await page.evaluate(async () =>
    (await indexedDB.databases()).map((db) => db.name)
  );
  expect(databases).toContain(
    `funes-capture-queue:${JSON.stringify([api, original.user.id])}`
  );
  await page.route(`${api}/auth/me`, (route) =>
    route.fulfill({
      json: { user: { ...original.user, id: "other-synthetic-owner" } }
    })
  );
  await page.route(`${api}/v1/captures`, (route) => route.abort());
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Application navigation" })
  ).toBeVisible();
  await context.setOffline(true);
  await expect(
    page.getByRole("alert").filter({ hasText: "Vault unreachable" })
  ).toBeVisible();
  await expect(page.getByText("No captures on this device.")).toBeVisible();
  await expect(
    page.getByText("Alice private offline capture", { exact: true })
  ).toHaveCount(0);
});

test("preserves a typed follow-up across first-turn stream persistence", async ({
  page
}) => {
  await signIn(page);
  await page.goto("/chat/new");
  await page.route(`${api}/v1/chat/threads/browser-persisted`, (route) =>
    route.fulfill({
      json: {
        sessionId: "browser-persisted",
        title: "First turn",
        titleLocked: false,
        messages: []
      }
    })
  );
  await page.evaluate((apiUrl) => {
    const fetchOriginal = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input) !== `${apiUrl}/v1/chat/messages/stream`) {
        return fetchOriginal(input, init);
      }
      const stream = new ReadableStream({
        start(controller) {
          const send = (chunk: unknown) =>
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          send({ type: "start", messageId: "stream-reply" });
          send({ type: "text-start", id: "answer" });
          send({
            type: "text-delta",
            id: "answer",
            delta: "First streamed answer"
          });
          send({
            type: "data-thread-state",
            data: {
              sessionId: "browser-persisted",
              title: "First turn",
              persisted: true
            }
          });
          send({
            type: "data-provider-disclosure",
            data: {
              provider: "Synthetic",
              model: "test",
              usesThirdParty: true,
              disclosure: "Test processor disclosure"
            }
          });
          window.addEventListener(
            "finish-synthetic-stream",
            () => {
              send({ type: "text-end", id: "answer" });
              send({ type: "finish" });
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
              controller.close();
            },
            { once: true }
          );
        }
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1"
        }
      });
    };
  }, api);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("First turn");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("First streamed answer", { exact: true })
  ).toBeVisible();
  await composer.fill("My unfinished follow-up");
  await composer.evaluate((element) => {
    element.setAttribute("data-original-composer", "true");
  });
  await page.route(`${api}/health`, (route) => route.abort());
  // A failed health poll must leave the mounted chat and live stream intact.
  await expect(
    page.getByRole("alert").filter({ hasText: "Vault unreachable" })
  ).toBeVisible({ timeout: 40_000 });
  await expect(composer).toHaveValue("My unfinished follow-up");
  await expect(composer).toHaveAttribute("data-original-composer", "true");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("finish-synthetic-stream"))
  );
  await expect(page).toHaveURL(/\/chat\/browser-persisted$/);
  await expect(composer).toHaveValue("My unfinished follow-up");
  await expect(composer).toHaveAttribute("data-original-composer", "true");
  await expect(
    page.getByText("First streamed answer", { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/Test processor disclosure/)).toBeVisible();
});

test("persists follow-ups to one thread and creates a separate thread after New thread", async ({
  page
}) => {
  await signIn(page);
  await page.goto("/chat/new");
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  async function send(text: string) {
    await composer.fill(text);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "New thread", exact: true })
    ).toBeEnabled();
  }
  await send("First thread starts here");
  await expect(page).not.toHaveURL(/\/chat\/new$/);
  const firstId = new URL(page.url()).pathname.split("/").at(-1)!;
  await send("Continue the first thread");
  expect(new URL(page.url()).pathname).toBe(`/chat/${firstId}`);
  await page.getByRole("button", { name: "New thread", exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/new$/);
  await expect(
    page.getByText("First thread starts here", { exact: true })
  ).toHaveCount(0);
  await send("Second thread starts here");
  await expect(page).not.toHaveURL(/\/chat\/new$/);
  const secondId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(secondId).not.toBe(firstId);
  const first = await (
    await page.request.get(`${api}/v1/chat/threads/${firstId}`)
  ).json();
  const second = await (
    await page.request.get(`${api}/v1/chat/threads/${secondId}`)
  ).json();
  expect(
    first.messages
      .filter((m: { role: string }) => m.role === "user")
      .map((m: { content: string }) => m.content)
  ).toEqual(["First thread starts here", "Continue the first thread"]);
  expect(
    second.messages
      .filter((m: { role: string }) => m.role === "user")
      .map((m: { content: string }) => m.content)
  ).toEqual(["Second thread starts here"]);
});

test.describe("installed offline capture", () => {
  test.use({ serviceWorkers: "allow" });
  test("reopens the shell offline and syncs a capture only to its remembered owner", async ({
    page,
    context
  }) => {
    test.skip(
      !process.env.CI,
      "The installed PWA requires a production build."
    );
    await signIn(page);
    const owner = await (await page.request.get(`${api}/auth/me`)).json();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller))
      )
      .toBe(true);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "New", exact: true })
    ).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your vault is unreachable" })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Application navigation" })
    ).toHaveCount(0);
    const text = `Cold-start capture ${Date.now()}`;
    await page
      .getByRole("textbox", { name: "Capture", exact: true })
      .fill(text);
    await page.getByRole("button", { name: "Queue capture" }).click();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    const synced = page.waitForResponse(
      (response) =>
        response.url() === `${api}/v1/captures` && response.status() === 201
    );
    await context.setOffline(false);
    const response = await synced;
    expect(response.request().headers()["x-funes-owner-id"]).toBe(
      owner.user.id
    );
    await page.goto("/inbox");
    await expect(
      page.getByRole("checkbox", { name: new RegExp(text) })
    ).toBeVisible();
  });
});
