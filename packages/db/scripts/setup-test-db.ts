import { execFileSync } from "node:child_process";

import { Client } from "pg";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://funes_vault:funes_vault@localhost:5432/funes_vault_test";
const target = new URL(databaseUrl);
const name = target.pathname.slice(1);
if (!/^[a-zA-Z0-9_]+_test$/.test(name)) {
  throw new Error(
    "TEST_DATABASE_URL must name a disposable database ending in _test"
  );
}
target.pathname = "/postgres";
const admin = new Client({ connectionString: target.toString() });
await admin.connect();
try {
  const existing = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [name]
  );
  if (!existing.rowCount) {
    await admin.query(`CREATE DATABASE "${name}"`);
  }
} finally {
  await admin.end();
}
const env = { ...process.env, DATABASE_URL: databaseUrl };
execFileSync("pnpm", ["db:migrate"], { env, stdio: "inherit" });
execFileSync("pnpm", ["db:seed"], { env, stdio: "inherit" });
