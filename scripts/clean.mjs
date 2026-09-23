import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
for (const parent of ["apps", "packages"]) {
  for (const workspace of await readdir(parent)) {
    const directory = join(parent, workspace);
    for (const entry of await readdir(directory)) {
      if (
        ["dist", "dist-e2e", ".next"].includes(entry) ||
        entry.endsWith(".tsbuildinfo")
      ) {
        await rm(join(directory, entry), { recursive: true, force: true });
      }
    }
  }
}
