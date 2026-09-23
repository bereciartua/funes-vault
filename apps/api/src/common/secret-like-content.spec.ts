import { describe, expect, it } from "vitest";

import {
  assertNoSecretLikeContent,
  detectSecretLikeContent
} from "./secret-like-content.js";
describe("privacy: secret-like content", () => {
  it.each([
    ["private_key", "-----BEGIN PRIVATE KEY-----"],
    ["aws_access_key", "AKIA" + "A".repeat(16)],
    ["openai_api_key", "sk-" + "x".repeat(24)],
    ["github_token", "ghp_" + "x".repeat(24)],
    [
      "jwt",
      "eyJ" + "a".repeat(10) + "." + "b".repeat(10) + "." + "c".repeat(10)
    ],
    ["assigned_secret", "password=long-example-only-value"]
  ])(
    "detects %s across content and nested metadata without echoing it",
    (name, value) => {
      expect(
        detectSecretLikeContent({ sourceMetadata: { nested: { value } } })
      ).toContain(name);
      try {
        assertNoSecretLikeContent({ body: value });
        throw new Error("not rejected");
      } catch (error) {
        expect(String(error)).not.toContain(value);
        expect(String(error)).toContain("BadRequestException");
      }
    }
  );
  it("allows ordinary discussion of credentials without credential material", () => {
    expect(
      detectSecretLikeContent({
        body: "I rotate my API keys and use a password manager."
      })
    ).toEqual([]);
  });
});
