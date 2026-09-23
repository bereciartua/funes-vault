import { describe, expect, it } from "vitest";

import { createSessionToken, hashSessionToken } from "./session.js";

describe("privacy: session utilities", () => {
  it("hashes opaque session tokens deterministically", () => {
    const token = createSessionToken();

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
  });
});
