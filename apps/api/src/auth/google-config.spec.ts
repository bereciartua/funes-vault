import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateEnvironment } from "../config.js";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://vault.example.com");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv(
    "GOOGLE_REDIRECT_URI",
    "https://api.example.com/auth/google/callback"
  );
});
afterEach(() => vi.unstubAllEnvs());

describe("privacy: Google deployment configuration", () => {
  it("accepts the production HTTPS callback", () => {
    expect(validateEnvironment).not.toThrow();
  });
  it("requires credentials in production", () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(validateEnvironment).toThrow("Google sign-in credentials");
  });
  it.each([
    "http://api.example.com/auth/google/callback",
    "http://localhost:4000/auth/google/callback",
    "https://api.example.com/other",
    "https://api.example.com/auth/google/callback?x=1",
    "https://user:secret@api.example.com/auth/google/callback"
  ])("rejects unsafe/misconfigured production callback %s", (uri) => {
    vi.stubEnv("GOOGLE_REDIRECT_URI", uri);
    expect(validateEnvironment).toThrow("GOOGLE_REDIRECT_URI");
  });
  it("allows HTTP localhost and unconfigured credentials for local startup", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv(
      "GOOGLE_REDIRECT_URI",
      "http://localhost:4000/auth/google/callback"
    );
    expect(validateEnvironment).not.toThrow();
  });
});
