import { describe, expect, it } from "vitest";

import { feedTime } from "./dates";

describe("feedTime", () => {
  it("uses a time for today and a short date for older entries", () => {
    const now = new Date("2026-07-10T16:00:00.000Z");
    expect(feedTime("2026-07-10T15:19:00.000Z", now)).toMatch(/\d{1,2}:\d{2}/);
    expect(feedTime("2026-07-09T15:19:00.000Z", now)).toContain("Jul");
  });

  it("handles absent and invalid timestamps", () => {
    expect(feedTime(null)).toBe("Not started");
    expect(feedTime("not-a-date")).toBe("Unknown");
  });
});
