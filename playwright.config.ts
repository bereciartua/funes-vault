import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.PLAYWRIGHT_WEB_PORT ?? 3000);
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? 4000);

const webBaseUrl =
  process.env.PLAYWRIGHT_WEB_URL ?? `http://localhost:${webPort}`;
const apiBaseUrl =
  process.env.PLAYWRIGHT_API_URL ?? `http://localhost:${apiPort}`;

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://funes_vault:funes_vault@localhost:5432/funes_vault_test";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60_000,
  retries: isCi ? 1 : 0,
  expect: {
    timeout: 10_000
  },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: webBaseUrl,
    trace: "retain-on-failure",
    serviceWorkers: "block"
  },
  webServer: [
    {
      command:
        "pnpm --filter @funes-vault/api exec tsc -p tsconfig.e2e.json && node apps/api/dist-e2e/test/web-server.js",
      url: `${apiBaseUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: "test",
        OPENAI_API_KEY: "synthetic-browser-test-key",
        API_PORT: String(apiPort),
        GOOGLE_REDIRECT_URI: `${apiBaseUrl}/auth/google/callback`,
        LOG_FORMAT: "json",
        APP_URL: webBaseUrl,
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        BULL_BOARD_ENABLED: "false",
        JOB_WORKER_ENABLED: "false"
      }
    },
    {
      command: isCi
        ? `pnpm --filter @funes-vault/web exec next start --port ${webPort}`
        : `pnpm --filter @funes-vault/web exec next dev --port ${webPort}`,
      url: webBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_URL: apiBaseUrl,
        PUBLIC_API_URL: apiBaseUrl
      }
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
