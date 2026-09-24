import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";

// This test creates and drops only its own disposable database.
const source = new URL(process.env.TEST_DATABASE_URL ?? "");
if (!source.pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must end in _test");
}
const name = `permissions_${randomBytes(6).toString("hex")}_test`;
const admin = new Client({ connectionString: source.href });
await admin.connect();
const target = new URL(source);
target.pathname = `/${name}`;
const db = new Client({ connectionString: target.href });
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  await db.connect();
  const baseline = await readFile(
    new URL(
      "../prisma/migrations/20260922000000_baseline/migration.sql",
      import.meta.url
    ),
    "utf8"
  );
  await db.query(baseline);
  await db.query(`
    INSERT INTO "User" (id,email,"updatedAt") VALUES ('owner','owner@example.test',NOW()),('other','other@example.test',NOW());
    INSERT INTO "Client" (id,"userId",name,type,"updatedAt") VALUES ('app','owner','App','MCP_CLIENT',NOW()),('tie','owner','Tie','MCP_CLIENT',NOW());
    INSERT INTO "Policy" (id,"userId","clientId",purpose,"updatedAt") VALUES
      ('old','owner','app','old','2026-01-01'), ('new','owner','app','new','2026-02-01'),
      ('invalid','other','app','invalid','2026-03-01'), ('tie_a','owner','tie','a','2026-01-01'), ('tie_z','owner','tie','z','2026-01-01');
    INSERT INTO "MemoryRequest" (id,"userId","clientId",purpose,task,status,"updatedAt") VALUES ('request','owner','app','old reason','color','NEEDS_USER_APPROVAL',NOW());
    INSERT INTO "MemorySuggestion" (id,"userId",title,body,"suggestedKind","sourceType","sourceMetadata","updatedAt") VALUES
      ('capture','owner','Capture','Capture text','FACT','MANUAL','{"captureId":"capture-123"}',NOW()),
      ('client','owner','Client','Client text','FACT','CLIENT_SUGGESTION','{"action":"archive_memory","captureId":"spoof"}',NOW()),
      ('chat','owner','Chat','Chat text','FACT','CHAT','{"origin":"chat"}',NOW());
  `);
  await db.query(
    await readFile(
      new URL(
        "../prisma/migrations/20260924000000_app_permissions/migration.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  assert.deepEqual(
    (await db.query('SELECT id FROM "Policy" ORDER BY id')).rows.map(
      (row) => row.id
    ),
    ["new", "tie_z"]
  );
  assert.deepEqual(
    (
      await db.query(
        'SELECT "policyId", "policyVersion", "statedPurpose" FROM "MemoryRequest"'
      )
    ).rows,
    [{ policyId: null, policyVersion: null, statedPurpose: "old reason" }]
  );
  const metadata = (
    await db.query(
      'SELECT id,"sourceMetadata" FROM "MemorySuggestion" ORDER BY id'
    )
  ).rows;
  assert.deepEqual(
    metadata.map((row) => row.sourceMetadata),
    [
      { captureId: "capture-123" },
      { origin: "chat" },
      { caller: { action: "archive_memory", captureId: "spoof" } }
    ]
  );
  const indexes = (
    await db.query(
      "SELECT indexname FROM pg_indexes WHERE indexname IN ('MemoryRequest_policyId_idx','MemorySuggestion_policyId_idx')"
    )
  ).rows;
  assert.equal(indexes.length, 2);
  console.log("App permissions migration data invariants passed");
} finally {
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}
