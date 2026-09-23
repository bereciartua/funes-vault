import { describe, expect, it, vi } from "vitest";

import { withProviderRetry } from "./provider-retry.js";
describe("privacy: provider retry permission", () => {
  it("rechecks permission before retrying a transient failure", async () => {
    const beforeCall = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("revoked"));
    const call = vi.fn().mockRejectedValue({ isRetryable: true });
    await expect(
      withProviderRetry(
        {
          beforeCall,
          signal: new AbortController().signal,
          deadline: Date.now() + 5000
        },
        {},
        call
      )
    ).rejects.toThrow("revoked");
    expect(call).toHaveBeenCalledOnce();
  });
});
