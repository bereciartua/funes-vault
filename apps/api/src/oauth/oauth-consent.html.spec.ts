import { describe, expect, it } from "vitest";

import { renderConsentPage } from "./oauth-consent.html.js";
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
