import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrations = "packages/db/prisma/migrations";
for (const entry of readdirSync(migrations, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const sql = readFileSync(
    join(migrations, entry.name, "migration.sql"),
    "utf8"
  );
  if (
    /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?"Embedding_vector_hnsw_idx"/i.test(sql)
  ) {
    throw new Error(`${entry.name} removes the SQL-managed HNSW index`);
  }
}
if (process.argv.includes("--drift")) {
  const diff = execFileSync(
    "pnpm",
    [
      "--filter",
      "@funes-vault/db",
      "exec",
      "prisma",
      "migrate",
      "diff",
      "--from-migrations",
      "prisma/migrations",
      "--to-schema",
      "prisma/schema.prisma",
      "--script"
    ],
    { encoding: "utf8" }
  );
  // Prisma cannot model indexes on Unsupported vector columns. The one known
  // SQL-managed index is the only permitted difference; all other DDL fails.
  const unexpected = diff
    .replace(/^--.*$/gm, "")
    .replace(/DROP INDEX "Embedding_vector_hnsw_idx";/g, "")
    .trim();
  if (unexpected) throw new Error(`Unexpected migration drift:\n${unexpected}`);
}
console.log("Migration guards passed");
