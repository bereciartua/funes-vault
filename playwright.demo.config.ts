import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

const servers = Array.isArray(base.webServer) ? base.webServer : [];
if (!new URL(servers[0]!.env!.DATABASE_URL!).pathname.endsWith("_test")) {
  throw new Error(
    "Demo browser tests require a disposable database ending in _test."
  );
}

export default defineConfig({
  ...base,
  testDir: "./e2e-demo",
  webServer: [
    {
      ...servers[0]!,
      command:
        "pnpm --filter @funes-vault/api build && node apps/api/dist/main.js",
      env: {
        ...servers[0]!.env,
        NODE_ENV: "development",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        OPENAI_API_KEY: ""
      }
    },
    servers[1]!
  ]
});
