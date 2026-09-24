import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { renderToStaticMarkup } from "../test/render";
import { AuthForm } from "./AuthForm";
import { authPanelSurface } from "./AuthGate";
import { PublicHome } from "./PublicHome";

describe("auth", () => {
  it("renders the anonymous public home with disclosure-preview copy and auth access", () => {
    const html = renderToStaticMarkup(
      createElement(PublicHome, {
        authForm: createElement(
          "form",
          { "aria-label": "Authentication" },
          createElement("button", { type: "submit" }, "Sign in")
        ),
        onSignIn: () => undefined
      })
    );

    expect(html).toContain("Your AI memory");
    expect(html).toContain("under your control.");
    expect(html).toContain("A coding agent asks for memory");
    expect(html).toContain("<strong>Shared</strong>");
    expect(html).toContain("<strong>Denied</strong>");
    expect(html).toContain("<strong>Held for you</strong>");
    expect(html).toContain("4 memories within their permissions");
    expect(html).toContain("approval decisions are recorded");
    expect(html).toContain("How it works");
    expect(html).toContain(
      `<time dateTime="${new Date().getFullYear()}">${new Date().getFullYear()}</time> funes`
    );
    expect(html).toContain("For builders");
    expect(html).toContain("Bearer PASTE_YOUR_APP_TOKEN");
    expect(html).not.toContain("&quot;purpose&quot;");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Authentication");
    expect(html).not.toContain("Account access");
    expect(html).not.toContain('<p class="eyebrow">Funes Vault</p>');
    expect(html).not.toContain("Account actions");
    expect(html).not.toContain("Start small");
    expect(html).not.toContain(
      "Open the vault with a deliberate first account"
    );
  });
  it("offers Google-only sign-in without password or demo controls", () => {
    const html = renderToStaticMarkup(
      createElement(AuthForm, {
        loginUrl: "http://localhost:4000/auth/google",
        error: "Sign-in canceled."
      })
    );
    expect(html).toContain("Continue with Google");
    expect(html).toContain('href="http://localhost:4000/auth/google"');
    expect(html).toContain("Sign-in canceled.");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("Use demo account");
  });
  it("keeps the authenticated branch selected only after session detection returns a user", () => {
    const user = {
      id: "user_1",
      email: "demo@funes-vault.local",
      displayName: "Demo User",
      role: "USER" as const
    };

    expect(authPanelSurface("checking", null)).toBe("checking");
    expect(authPanelSurface("anonymous", null)).toBe("anonymous");
    expect(authPanelSurface("authenticated", null)).toBe("anonymous");
    expect(authPanelSurface("authenticated", user)).toBe("authenticated");
  });
});
