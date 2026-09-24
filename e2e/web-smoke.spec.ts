import { expect, test } from "@playwright/test";

const apiBaseUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";
async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/vault");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByRole("link", { name: "Choose test account" }).click();
  await expect(
    page.getByRole("button", { name: "New", exact: true })
  ).toBeVisible();
}

test("shows the Signals public home while logged out", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Your AI memory, under your control."
    })
  ).toBeVisible();
});

test("authenticates, creates and filters a memory, reviews a suggestion, and opens chat", async ({
  page
}) => {
  await signIn(page);

  const suffix = Date.now().toString(36);
  const memoryTitle = `Playwright smoke memory ${suffix}`;
  const memoryBody = `Created by the web smoke suite at ${new Date().toISOString()}.`;

  await page.getByRole("button", { name: "New" }).click();
  await page.getByLabel(/Title/).fill(memoryTitle);
  await page.getByLabel(/Body/).fill(memoryBody);
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Memory created.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(memoryTitle) })
  ).toBeVisible();

  await page.getByRole("searchbox").fill(memoryTitle);
  await expect(
    page.getByRole("button", { name: new RegExp(memoryTitle) })
  ).toBeVisible();

  await page.getByRole("button", { name: new RegExp(memoryTitle) }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();

  const suggestionText = `Playwright smoke suggestion ${suffix}`;
  const captureResponse = await page.request.post(`${apiBaseUrl}/v1/captures`, {
    data: {
      text: suggestionText,
      captureId: `pw-${suffix}`,
      capturedAt: new Date().toISOString()
    }
  });
  expect(captureResponse.ok()).toBeTruthy();

  await page.goto("/inbox");
  const suggestionCheckbox = page.getByRole("checkbox", {
    name: new RegExp(suggestionText)
  });
  await expect(suggestionCheckbox).toBeVisible();
  await suggestionCheckbox.click();
  await expect(page.getByText("1 suggestion selected")).toBeVisible();
  await page.getByRole("button", { name: "Apply selected" }).click();
  await page.getByRole("button", { name: "Apply all selected" }).click();
  await expect(page.getByText("Applied 1 suggestion.")).toBeVisible();

  await page.goto("/chat/new");
  await expect(page.getByRole("heading", { name: "New thread" })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true })
  ).toBeVisible();
});

test("hands Home text and voice into fresh chat threads without remounting the app", async ({
  page
}) => {
  await signIn(page);
  let sessionProbeCount = 0;
  let chatRequestBody: Record<string, unknown> | null = null;
  let voiceRequestBody: Record<string, unknown> | null = null;
  page.on("request", (request) => {
    if (request.url() === `${apiBaseUrl}/auth/me`) {
      sessionProbeCount += 1;
    }
  });
  await page.route(`${apiBaseUrl}/v1/chat/messages/stream`, async (route) => {
    chatRequestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 503,
        error: "Service Unavailable",
        message: "Chat provider disabled in this smoke test."
      })
    });
  });
  await page.route(`${apiBaseUrl}/v1/chat/voice-sessions`, async (route) => {
    voiceRequestBody = route.request().postDataJSON() as Record<
      string,
      unknown
    >;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        statusCode: 503,
        error: "Service Unavailable",
        message: "Voice provider disabled in this smoke test."
      })
    });
  });

  await page.getByRole("link", { name: "Home", exact: true }).click();

  const composer = page.getByLabel("Ask your vault");
  await expect(composer).toBeVisible();
  const initialMessage = "What do you remember about my working style?";
  await composer.fill(initialMessage);
  await page.getByRole("button", { name: "Send to your vault" }).click();
  await expect(page).toHaveURL(/\/chat\/new$/);
  await expect(page.getByText(initialMessage, { exact: true })).toBeVisible();
  const initialUserTurn = page
    .locator(".memory-message--user")
    .filter({ hasText: initialMessage });
  await expect(initialUserTurn.locator("time")).toBeVisible();
  await expect(page.locator(".chat-date-divider")).toHaveCount(0);
  await expect.poll(() => chatRequestBody).not.toBeNull();
  expect(chatRequestBody).toMatchObject({
    message: initialMessage,
    startNewThread: true
  });

  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page
    .getByRole("button", { name: "Start a voice conversation" })
    .click();
  await expect(page).toHaveURL(/\/chat\/new$/);
  await expect(
    page.getByRole("region", { name: "Voice session" })
  ).toBeVisible();
  await expect.poll(() => voiceRequestBody).not.toBeNull();
  expect(voiceRequestBody).toMatchObject({ startNewThread: true });

  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("link", { name: /Memories/ }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(
    page.getByRole("heading", { name: "Your vault at a glance" })
  ).toBeVisible();
  expect(sessionProbeCount).toBe(0);
});

test("redirects legacy surface URLs to canonical routes", async ({ page }) => {
  await signIn(page);

  await page.goto("/?surface=overview");
  await expect(page).toHaveURL(/\/overview$/);

  await page.goto("/?surface=settings&settings=policies");
  await expect(page).toHaveURL(/\/settings\/clients$/);

  await page.goto("/?surface=chat&threadId=legacy-thread");
  await expect(page).toHaveURL(/\/chat\/legacy-thread$/);
});

test.describe("memory processing permissions", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    for (const scope of ["extraction", "consolidation"]) {
      const response = await page.request.post(
        `${apiBaseUrl}/v1/memory-processing/consent`,
        { data: { scope, granted: false, version: 1 } }
      );
      expect(response.ok()).toBeTruthy();
    }
  });
  test("discloses memory processors and persists independent TypeSafe permission", async ({
    page
  }) => {
    await page.route(
      `${apiBaseUrl}/v1/memory-processing/capabilities`,
      async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        data.extraction.processors = ["typesafe", "openai"];
        await route.fulfill({ response, json: data });
      }
    );
    await page.goto("/settings/profile");
    await expect(
      page.getByRole("heading", { name: "Memory processing" })
    ).toBeVisible();
    await expect(page.getByText(/before sensitivity is known/)).toBeVisible();
    const allow = page.getByRole("button", {
      name: "Allow TypeSafe extraction"
    });
    const revoke = page.getByRole("button", {
      name: "Revoke TypeSafe extraction"
    });
    await allow.click();
    await expect(revoke).toBeVisible();
    await page.reload();
    await expect(revoke).toBeVisible();
    await revoke.click();
    await expect(allow).toBeVisible();
  });
});

test("explains skipped voice capture and retries the saved source", async ({
  page
}) => {
  await signIn(page);
  let retried = false;
  const completed = {
    status: "completed",
    sourceMessageId: "voice-source",
    outcomes: [{ status: "QUEUED_FOR_REVIEW" }]
  };
  await page.route(`${apiBaseUrl}/v1/chat/threads/voice-recovery`, (route) =>
    route.fulfill({
      json: {
        sessionId: "voice-recovery",
        title: "Voice recovery",
        titleLocked: false,
        messages: [
          {
            id: "voice-source",
            role: "user",
            content: "I prefer quiet rooms.",
            createdAt: "2026-09-22T12:00:00Z",
            processing: retried
              ? completed
              : {
                  status: "skipped",
                  reason: "voice_finalization_window_closed",
                  sourceMessageId: "voice-source",
                  outcomes: []
                }
          }
        ]
      }
    })
  );
  await page.route(
    `${apiBaseUrl}/v1/memory-processing/sources/voice-source/retry`,
    async (route) => {
      expect(route.request().method()).toBe("POST");
      retried = true;
      await route.fulfill({ json: completed });
    }
  );
  await page.goto("/chat/voice-recovery");
  await expect(page.getByText(/Retry this saved turn/)).toBeVisible();
  await page.getByRole("button", { name: "Retry memory processing" }).click();
  await expect(page.getByText(/0 saved, 1 queued/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry memory processing" })
  ).toHaveCount(0);
});
