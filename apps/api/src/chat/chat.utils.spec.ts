import { describe, expect, it } from "vitest";

import {
  citationsForRefs,
  clip,
  parseCitationArray,
  parseProvider,
  previewText,
  safeErrorMessage
} from "./chat.utils.js";
describe("privacy: chat display helpers", () => {
  it("clips bounded text and normalizes preview whitespace", () => {
    expect(clip("abcdef", 4)).toBe("a...");
    expect(clip("abcdef", 2)).toBe("ab");
    expect(previewText(" a\n  b ")).toBe("a b");
    expect(previewText(null)).toBeNull();
  });
  it("rejects malformed metadata instead of inventing citations or provider claims", () => {
    expect(parseCitationArray([{ memoryId: "x" }])).toEqual([]);
    expect(parseProvider({ provider: "x" })).toBeUndefined();
  });
  it("keeps only valid distinct one-based citation references", () => {
    const citations = [
      {
        memoryId: "a",
        title: "A",
        categoryKeys: [],
        sensitivity: "LOW" as const,
        relevanceScore: 1
      }
    ];
    expect(citationsForRefs([0, 1, 1, 2], citations)).toEqual(citations);
  });
  it("bounds provider errors and handles non-error rejections", () => {
    expect(safeErrorMessage(new Error("x".repeat(1000)))).toHaveLength(300);
    expect(safeErrorMessage(null)).toBe("Unknown provider error");
  });
});
