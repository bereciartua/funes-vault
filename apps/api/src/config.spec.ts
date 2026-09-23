import { afterEach, describe, expect, it, vi } from "vitest";

import {
  apiEnv,
  resetEnvironmentForTests,
  validateEnvironment
} from "./config.js";

const touchedVars = [
  "API_PORT",
  "APP_URL",
  "EMBEDDINGS_MAX_SENSITIVITY",
  "OAUTH_ACCESS_TOKEN_TTL_SECONDS",
  "OPENAI_CHAT_MODEL"
];

const setEnv = vi.stubEnv;

afterEach(() => {
  resetEnvironmentForTests();
  vi.unstubAllEnvs();
});

describe("apiEnv", () => {
  it("memoizes only validated bootstrap configuration", () => {
    setEnv("API_PORT", "4100");
    validateEnvironment();
    setEnv("API_PORT", "4200");
    expect(apiEnv().API_PORT).toBe(4100);
    resetEnvironmentForTests();
    expect(apiEnv().API_PORT).toBe(4200);
  });
  it("coerces explicit boolean flags and rejects misspellings", () => {
    setEnv("BULL_BOARD_ENABLED", "yes");
    setEnv("JOB_WORKER_ENABLED", "0");
    expect(apiEnv()).toMatchObject({
      BULL_BOARD_ENABLED: true,
      JOB_WORKER_ENABLED: false
    });
    setEnv("BULL_BOARD_ENABLED", "treu");
    expect(() => validateEnvironment()).toThrow(/BULL_BOARD_ENABLED/);
  });
  it("applies defaults and coerces numbers", () => {
    for (const name of touchedVars) {
      setEnv(name, undefined);
    }
    setEnv("API_PORT", "4100");

    const env = apiEnv();

    expect(env.API_PORT).toBe(4100);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.OPENAI_CHAT_MODEL).toBe("gpt-5.5");
  });

  it("treats empty strings as unset", () => {
    setEnv("OPENAI_CHAT_MODEL", "  ");

    expect(apiEnv().OPENAI_CHAT_MODEL).toBe("gpt-5.5");
  });
});

describe("validateEnvironment", () => {
  it("rejects a non-HTTPS public app URL in production", () => {
    setEnv("NODE_ENV", "production");
    setEnv("APP_URL", "http://vault.example");
    setEnv("GOOGLE_REDIRECT_URI", "https://api.example/auth/google/callback");
    setEnv("GOOGLE_CLIENT_ID", "test-client");
    setEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    setEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
    expect(() => validateEnvironment()).toThrow(/APP_URL must use HTTPS/);
    setEnv("APP_URL", "https://vault.example");
    expect(() => validateEnvironment()).not.toThrow();
  });
  it("accepts the current environment", () => {
    for (const name of touchedVars) {
      setEnv(name, undefined);
    }

    expect(() => validateEnvironment()).not.toThrow();
  });

  it("fails fast on misspelled sensitivity levels, naming the variable", () => {
    setEnv("EMBEDDINGS_MAX_SENSITIVITY", "SUPER_SECRET");

    expect(() => validateEnvironment()).toThrow(/EMBEDDINGS_MAX_SENSITIVITY/);
  });

  it("fails fast on malformed numeric values", () => {
    setEnv("OAUTH_ACCESS_TOKEN_TTL_SECONDS", "ten minutes");

    expect(() => validateEnvironment()).toThrow(
      /OAUTH_ACCESS_TOKEN_TTL_SECONDS/
    );
  });
});
