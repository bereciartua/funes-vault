import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const entryDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(entryDir, "..");
const repoRoot = resolve(apiRoot, "..", "..");

for (const path of [resolve(repoRoot, ".env"), resolve(apiRoot, ".env")]) {
  if (existsSync(path)) {
    config({ path, override: false, quiet: true });
  }
}
