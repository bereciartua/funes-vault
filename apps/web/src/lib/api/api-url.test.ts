import { describe, expect, it } from "vitest";

import { resolveApiUrl } from "./api-url";

describe("api", () => {
  it("prefers the runtime API origin alias over the build-time value", () => {
    // NEXT_PUBLIC_* is inlined into prebuilt bundles at image build time,
    // so PUBLIC_API_URL is what lets one image serve any deployment origin.
    expect(
      resolveApiUrl({
        PUBLIC_API_URL: "https://api.vault.example.com",
        NEXT_PUBLIC_API_URL: "http://localhost:4000"
      })
    ).toBe("https://api.vault.example.com");
    expect(
      resolveApiUrl({ NEXT_PUBLIC_API_URL: "http://192.168.1.50:4000" })
    ).toBe("http://192.168.1.50:4000");
    expect(resolveApiUrl({})).toBe("http://localhost:4000");
  });
});
