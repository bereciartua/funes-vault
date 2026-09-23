import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionCookieName } from "./auth.constants.js";
import { clearSessionCookie, readCookie, setSessionCookie } from "./cookies.js";

afterEach(() => vi.unstubAllEnvs());
describe("privacy: session cookies", () => {
  it.each([
    ["https://vault.example", true],
    ["http://localhost:3000", false]
  ])("derives secure cookies from %s", (url, secure) => {
    vi.stubEnv("APP_URL", url);
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };
    setSessionCookie(response, "opaque-token");
    clearSessionCookie(response);
    expect(response.cookie).toHaveBeenCalledWith(
      sessionCookieName,
      "opaque-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/"
      })
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      sessionCookieName,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/"
      })
    );
  });
  it("keeps production cookies secure even before invalid configuration fails boot", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://vault.example");
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };
    setSessionCookie(response, "opaque-token");
    clearSessionCookie(response);
    expect(response.cookie).toHaveBeenCalledWith(
      sessionCookieName,
      "opaque-token",
      expect.objectContaining({ secure: true })
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      sessionCookieName,
      expect.objectContaining({ secure: true })
    );
  });
  it("matches exact cookie names, decodes values, and rejects malformed encoding", () => {
    expect(
      readCookie("prefix_session=wrong; session=correct%20value", "session")
    ).toBe("correct value");
    expect(readCookie("prefix_session=wrong", "session")).toBeNull();
    expect(readCookie("session=%invalid", "session")).toBeNull();
    expect(readCookie(undefined, "session")).toBeNull();
  });
});
