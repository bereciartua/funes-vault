import { describe, expect, it } from "vitest";

import { serverEnv } from "./server-env";
describe("web server environment", () => {
  it("prefers the runtime API origin and rejects invalid protocols", () => {
    expect(
      serverEnv({
        PUBLIC_API_URL: "https://api.example.com",
        NEXT_PUBLIC_API_URL: "http://localhost:4000"
      }).apiUrl
    ).toBe("https://api.example.com");
    expect(() =>
      serverEnv({ PUBLIC_API_URL: "javascript:alert(1)" })
    ).toThrow();
    expect(() => serverEnv({ NODE_ENV: "prod" })).toThrow();
  });
});
