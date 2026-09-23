import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

// Explicit opt-in; ordinary browser checks never discover paid-provider tests.
export default defineConfig({
  ...base,
  testDir: "./e2e-live",
  retries: 0,
  workers: 1
});
