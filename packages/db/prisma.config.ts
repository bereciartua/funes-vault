import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../.env", import.meta.url), quiet: true });

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
    url:
      process.env.DATABASE_URL ??
      "postgresql://funes_vault:funes_vault@localhost:5432/funes_vault?schema=public"
  }
});
