import { describe, expect, it, vi } from "vitest";

import { initializeWorker } from "./worker-startup.js";

describe("HTTP queue startup", () => {
  it("does not delay HTTP listening for an unavailable embedded worker", async () => {
    const unavailable = new Promise(() => undefined);
    await expect(
      initializeWorker(unavailable, vi.fn())
    ).resolves.toBeUndefined();
  });
  it("handles a background connection failure without an unhandled rejection", async () => {
    const failure = vi.fn();
    await initializeWorker(Promise.reject(new Error("offline")), failure);
    expect(failure).toHaveBeenCalledOnce();
  });
});
