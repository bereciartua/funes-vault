import { describe, expect, it } from "vitest";

import { capturesThisWeek, weekdayExtremes } from "./capture-series";

describe("capture series helpers", () => {
  it("counts captures in the latest seven days without going negative", () => {
    const series = Array.from({ length: 14 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      count: index < 7 ? 1 : 2
    }));
    expect(capturesThisWeek(series)).toBe(14);
    expect(capturesThisWeek(series.slice(-5))).toBe(10);
    expect(capturesThisWeek([])).toBe(0);
  });

  it("handles empty and short weekday series", () => {
    expect(weekdayExtremes([])).toBe("No capture rhythm yet");
    expect(weekdayExtremes([{ date: "2026-07-06", count: 3 }])).toContain(
      "Monday"
    );
  });
});
