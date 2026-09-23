import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Node resolves this entrypoint to its real package location, including after
// pnpm deploy relocates dependencies. Do not invoke a copied package-manager shim.
const require = createRequire(import.meta.url);
execFileSync(
  process.execPath,
  [
    require.resolve("prisma/build/index.js"),
    "migrate",
    "deploy",
    "--config",
    fileURLToPath(new URL("../prisma.config.ts", import.meta.url))
  ],
  { stdio: "inherit" }
);
