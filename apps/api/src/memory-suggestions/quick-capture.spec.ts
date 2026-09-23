import { describe, expect, it } from "vitest";

import { quickCaptureTitle } from "./quick-capture.js";

describe("privacy: quickCaptureTitle", () => {
  it("uses the first non-empty line", () => {
    expect(quickCaptureTitle("\n\n  Buy stamps  \nMore detail")).toBe(
      "Buy stamps"
    );
  });
  it("collapses whitespace and truncates long lines with an ellipsis", () => {
    const title = quickCaptureTitle(`${"word ".repeat(40)}end`);

    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("…")).toBe(true);
  });
  it("falls back when text has no usable line", () => {
    expect(quickCaptureTitle("   \n  ")).toBe("Quick capture");
  });
});
