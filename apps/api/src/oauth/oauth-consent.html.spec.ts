import { describe, expect, it } from "vitest";

import { renderConsentPage } from "./oauth-consent.html.js";
import type { ConsentContext } from "./oauth-grants.service.js";
describe("privacy: consent HTML", () => {
  it("escapes untrusted client names and hidden form values", () => {
    const html = renderConsentPage({
      context: {
        requestId: "request",
        clientName: '<script>alert("x")</script>',
        clientUri: null,
        logoUri: null,
        redirectHost: "client.example",
        redirectOrigin: "https://client.example",
        scopes: [],
        registrationStatus: "APPROVED",
        operations: ["READ", "SUGGEST"],
        createsPermissions: true,
        recreating: false,
        addedOperations: ["READ", "SUGGEST"],
        allowedCategories: [],
        deniedCategories: [],
        requiresConfirmation: false,
        expiresAt: null,
        maxSensitivity: "INTERNAL"
      },
      nonce: '" onmouseover="alert(1)',
      userEmail: "owner@example.test"
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot; onmouseover=&quot;");
    expect(html).not.toContain('value="" onmouseover=');
  });
});

const context: ConsentContext = {
  requestId: "request",
  clientName: "App",
  clientUri: null,
  logoUri: null,
  redirectHost: "client.example",
  redirectOrigin: "https://client.example",
  scopes: ["memory.suggest"],
  registrationStatus: "APPROVED",
  operations: ["SUGGEST", "WRITE"],
  createsPermissions: false,
  recreating: false,
  addedOperations: [],
  allowedCategories: ["preferences"],
  deniedCategories: [],
  requiresConfirmation: false,
  expiresAt: null,
  maxSensitivity: "LOW"
};
const render = (overrides: Partial<ConsentContext>) =>
  renderConsentPage({
    context: { ...context, ...overrides },
    nonce: "nonce",
    userEmail: "owner@example.test"
  });
it.each([
  [{}, true],
  [{ requiresConfirmation: true }, false],
  [{ operations: ["SUGGEST"] }, false],
  [{ scopes: ["memory.read"] }, false]
] as [Partial<ConsentContext>, boolean][])(
  "warns about immediate proposals only when usable: %j",
  (overrides, warned) => {
    expect(
      render(overrides).includes("applied immediately without review")
    ).toBe(warned);
  }
);
it("explains expired permissions without a raw ISO timestamp", () => {
  const html = render({ expiresAt: "2020-01-01T00:00:00.000Z" });
  expect(html).toContain("Expired — update the expiration");
  expect(html).not.toContain("2020-01-01T");
});
it("discloses restored defaults and category limits", () => {
  const html = render({ createsPermissions: true, recreating: true });
  expect(html).toContain("Approving will restore default permissions");
  expect(html).toContain("Allowed categories: preferences");
});
