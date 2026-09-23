import { afterEach, describe, expect, it, vi } from "vitest";

import { FunesVaultApiClient, FunesVaultApiError } from "./api-client.js";

afterEach(() => vi.unstubAllGlobals());
describe("upstream failures", () => {
  it("reports an HTML proxy failure as an API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<h1>Private upstream diagnostic: secret-value</h1>", {
          status: 502
        })
      )
    );
    const client = new FunesVaultApiClient({ clientToken: "test" });
    const result = client.listMemoryCategories();
    await expect(result).rejects.toBeInstanceOf(FunesVaultApiError);
    await expect(result).rejects.toMatchObject({
      status: 502,
      message: "Funes Vault API request failed (502)"
    });
  });
  it("normalizes trailing separators without rescanning embedded slash runs", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"items":[]}'));
    vi.stubGlobal("fetch", fetch);
    const apiUrl = `https://vault.example/${"/".repeat(100_000)}segment///`;
    await new FunesVaultApiClient({
      apiUrl,
      clientToken: "test"
    }).listMemoryCategories();
    expect(fetch).toHaveBeenCalledWith(
      `${apiUrl.slice(0, -3)}/v1/memory-categories`,
      expect.any(Object)
    );
  });
  it("bounds upstream requests with an abort signal", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"items":[]}'));
    vi.stubGlobal("fetch", fetch);
    await new FunesVaultApiClient({
      clientToken: "test"
    }).listMemoryCategories();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});

it.each([401, 403])(
  "treats upstream %i as credential refusal, not an outage",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status }))
    );
    await expect(
      new FunesVaultApiClient({ clientToken: "test" }).verifyToken()
    ).resolves.toBe(false);
  }
);
