import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "./index.js";

describe("healthResponseSchema", () => {
  it("validates a healthy response", () => {
    const parsed = healthResponseSchema.parse({
      status: "ok",
      service: "test-service",
      timestamp: "2026-06-26T00:00:00.000Z"
    });

    expect(parsed.service).toBe("test-service");
  });
});
