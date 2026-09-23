import { afterEach, describe, expect, it, vi } from "vitest";

import { createPrismaClient } from "./index.js";

afterEach(() => vi.unstubAllEnvs());
describe("createPrismaClient", () => {
  it("requires an explicit connection URL", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => createPrismaClient()).toThrow("DATABASE_URL is required");
  });
  it("creates independent clients without connecting on import", async () => {
    const first = createPrismaClient("postgresql://test:test@localhost/test");
    const second = createPrismaClient("postgresql://test:test@localhost/test");
    expect(typeof first.$connect).toBe("function");
    expect(first === second).toBe(false);
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });
});
