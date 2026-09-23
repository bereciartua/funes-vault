import { afterEach, describe, expect, it, vi } from "vitest";

import { scheduleDebouncedUpdate } from "./debounce";

describe("scheduleDebouncedUpdate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the delay before publishing the latest value", () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn();

    const cancelFirst = scheduleDebouncedUpdate("f", onUpdate, 300);
    cancelFirst();
    const cancelSecond = scheduleDebouncedUpdate("funes", onUpdate, 300);

    vi.advanceTimersByTime(299);
    expect(onUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith("funes");

    cancelSecond();
  });
});
