import { describe, expect, it } from "vitest";

import { toAuthResponse } from "./auth.service.js";
import { loginReturnTo } from "./google-login.service.js";

describe("privacy: auth boundaries", () => {
  it("returns only public profile fields", () => {
    const user = {
      id: "u",
      email: "u@example.com",
      displayName: null,
      role: "USER" as const,
      googleIdentity: { subject: "private-subject" },
      sessions: [{ tokenHash: "secret" }]
    };
    expect(toAuthResponse(user)).toEqual({
      user: { id: "u", email: "u@example.com", displayName: null, role: "USER" }
    });
  });
  it("allows only app routes and complete MCP continuations", () => {
    expect(loginReturnTo(undefined)).toBe("/vault");
    expect(loginReturnTo("/chat/thread-1")).toBe("/chat/thread-1");
    for (const path of [
      "//evil.test",
      "https://evil.test",
      "/vault#fragment",
      "/oauth/consent?request=x",
      "/oauth/consent?request=x&nonce=y&extra=z",
      ["/vault"]
    ]) {
      expect(() => loginReturnTo(path)).toThrow();
    }
  });
});
