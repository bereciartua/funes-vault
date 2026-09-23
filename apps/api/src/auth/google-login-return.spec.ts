import { describe, expect, it } from "vitest";

import { loginReturnTo } from "./google-login.service.js";
describe("privacy: login return-path allowlist", () => {
  it.each([
    "/vault",
    "/chat/thread_123",
    "/settings/data",
    "/oauth/consent?request=id&nonce=value"
  ])("allows %s", (path) => expect(loginReturnTo(path)).toBe(path));
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/vault#fragment",
    "/vault?redirect=evil",
    "/oauth/consent?request=id",
    "/oauth/consent?request=id&nonce=x&extra=y",
    "/unknown",
    null,
    {}
  ])("rejects an unsafe return target", (path) =>
    expect(() => loginReturnTo(path)).toThrow()
  );
  it("defaults to the vault", () =>
    expect(loginReturnTo(undefined)).toBe("/vault"));
});
