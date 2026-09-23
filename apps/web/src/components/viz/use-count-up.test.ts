import { describe, expect, it } from "vitest";

import { countUpEase } from "./use-count-up";

describe("countUpEase", () => {
  it("has exact easing endpoints", () => {
    expect(countUpEase(0)).toBe(0);
    expect(countUpEase(1)).toBe(1);
  });
});
