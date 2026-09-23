import { afterEach, describe, expect, it, vi } from "vitest";

import { withDeadline } from "./deadline.js";
afterEach(() => vi.useRealTimers());
describe("infrastructure deadlines", () => {
  it("rejects a permanently unavailable dependency within its deadline", async () => {
    vi.useFakeTimers();
    const operation = withDeadline(new Promise(() => {}), 10000);
    const failure = expect(operation).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10000);
    await failure;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears its timer on success and propagates immediate failures", async () => {
    vi.useFakeTimers();
    await expect(withDeadline(Promise.resolve(42), 10000)).resolves.toBe(42);
    await expect(
      withDeadline(Promise.reject(new Error("offline")), 10000)
    ).rejects.toThrow("offline");
    expect(vi.getTimerCount()).toBe(0);
  });
});
