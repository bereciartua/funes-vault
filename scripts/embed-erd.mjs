import { readFile, writeFile } from "node:fs/promises";
const diagram = await readFile(
  new URL("../packages/db/.generated/entity-relationship.md", import.meta.url),
  "utf8"
);
const target = new URL("../docs/database-schema.md", import.meta.url);
const original = await readFile(target, "utf8");
const markers = /<!-- ERD:START -->[\s\S]*?<!-- ERD:END -->/;
if (!markers.test(original))
  throw new Error("Database reference is missing ERD markers");
await writeFile(
  target,
  original.replace(
    markers,
    `<!-- ERD:START -->\n${diagram.trim()}\n<!-- ERD:END -->`
  )
);
