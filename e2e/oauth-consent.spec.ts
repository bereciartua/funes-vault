import { createHash } from "node:crypto";
import { createServer } from "node:http";

import { expect, test as base } from "@playwright/test";

const api = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:4000";
const test = base.extend<{ callbackUrl: string }>({
  // Playwright requires fixture dependency destructuring even when there are none.
  // eslint-disable-next-line no-empty-pattern
  callbackUrl: async ({}, use) => {
    const server = createServer((_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end("<h1>Connector callback</h1>");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Missing callback address");
    }
    try {
      await use(`http://127.0.0.1:${address.port}/callback`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }
});

test("approves OAuth consent in Chromium and follows the external form redirect", async ({
  page,
  callbackUrl: redirectUri
}) => {
  await page.goto("/vault");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await page
    .getByRole("link", { name: "Choose test account", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Application navigation" })
  ).toBeVisible();
  const registration = await page.request.post(`${api}/register`, {
    data: {
      client_name: "Browser consent test",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    }
  });
  expect(registration.status()).toBe(201);
  const { client_id: clientId } = await registration.json();
  const verifier = "a".repeat(64);
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: "browser-consent-state"
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.goto(`${api}/authorize?${query}`);
  await expect(
    page.getByRole("heading", {
      name: "Browser consent test wants access to your vault"
    })
  ).toBeVisible();
  const consentResponse = await page.request.get(page.url());
  expect(consentResponse.headers()["cross-origin-opener-policy"]).toBe(
    "same-origin"
  );
  expect(consentResponse.headers()["content-security-policy"]).toContain(
    `form-action 'self' ${new URL(redirectUri).origin}`
  );
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connector callback" })
  ).toBeVisible();
  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe("browser-consent-state");
  const code = callback.searchParams.get("code");
  expect(code).toBeTruthy();
  expect(
    errors.filter((message) =>
      /Content Security Policy|form-action/i.test(message)
    )
  ).toEqual([]);
  const token = await page.request.post(`${api}/token`, {
    form: {
      grant_type: "authorization_code",
      client_id: clientId,
      code: code!,
      redirect_uri: redirectUri,
      code_verifier: verifier
    }
  });
  expect(token.status()).toBe(200);
});
