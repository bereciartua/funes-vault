import { expect, test } from "@playwright/test";

// Opt-in paid smoke only: the microphone is synthetic, never the host's mic.
const audio = process.env.LIVE_VOICE_AUDIO_FILE;
const api = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";
test.skip(
  !audio || !process.env.OPENAI_API_KEY,
  "Requires an explicit synthetic WAV and live provider credentials"
);
test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      ...(audio ? [`--use-file-for-fake-audio-capture=${audio}%noloop`] : [])
    ]
  }
});
test.afterEach(async ({ page }) => {
  // Do not leave paid-provider processing enabled for later local smoke runs.
  await page.request.post(`${api}/v1/memory-processing/consent`, {
    data: { scope: "extraction", granted: false, version: 1 }
  });
});
test("captures a synthetic voice turn through real Realtime and memory processing", async ({
  page
}) => {
  test.setTimeout(120_000);
  await page.goto("/vault");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page.getByRole("link", { name: "Choose test account" }).click();
  await expect(
    page.getByRole("navigation", { name: "Application navigation" })
  ).toBeVisible();
  await page.goto("/settings/profile");
  const consent = await page.request.post(
    `${api}/v1/memory-processing/consent`,
    { data: { scope: "extraction", granted: true, version: 1 } }
  );
  expect(consent.ok()).toBeTruthy();
  await page.goto("/");
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/voice-sessions/") &&
      response.url().endsWith("/turns") &&
      response.request().postDataJSON()?.role === "user",
    { timeout: 90_000 }
  );
  await page
    .getByRole("button", { name: "Start a voice conversation" })
    .click();
  await expect(
    page.getByRole("region", { name: "Voice session" })
  ).toBeVisible();
  const response = await saved;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.message.id).toEqual(expect.any(String));
  expect(result.message.role).toBe("user");
  expect(result.message.content.trim().length).toBeGreaterThan(0);
  expect(result.message.processing.status).toBe("completed");
  expect(
    result.message.processing.outcomes.some((outcome: { status: string }) =>
      ["QUEUED_FOR_REVIEW", "APPLIED", "deduplicated"].includes(outcome.status)
    )
  ).toBeTruthy();
  await expect(
    page.locator(".voice-live-message .processing-outcome").first()
  ).toContainText(/saved|queued/);
  await page.getByRole("button", { name: "End", exact: true }).click();
  const persisted = await page.request.get(
    `${api}/v1/memory-processing/sources/${result.message.id}`
  );
  expect((await persisted.json()).status).toBe("completed");
});
