import { vaultExportResponseSchema } from "@funes-vault/shared";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: vault portability (e2e)", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createE2ePrismaClient>;
  beforeAll(async () => {
    app = await createE2eApp();
    prisma = createE2ePrismaClient();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  it("round trips into the importing owner without copying credentials or overwriting the source", async () => {
    const alice = await createUserWithSession(prisma, "alice@example.com");
    const bob = await createUserWithSession(prisma, "bob@example.com");
    const api = () => request(app.getHttpServer());
    const created = await api()
      .post("/v1/memories")
      .set("Cookie", alice.cookie)
      .send({
        title: "Writing preference",
        body: "Prefer short paragraphs.",
        kind: "PREFERENCE",
        categoryKeys: ["personal_preferences"]
      })
      .expect(201);
    const client = await api()
      .post("/v1/clients")
      .set("Cookie", alice.cookie)
      .send({ name: "Portable client", trustLevel: "APPROVED" })
      .expect(201);
    await api()
      .post("/v1/policies")
      .set("Cookie", alice.cookie)
      .send({
        clientId: client.body.client.id,
        operations: ["READ"]
      })
      .expect(201);
    const exported = await api()
      .get("/v1/data/export?includeAuditEvents=true")
      .set("Cookie", alice.cookie)
      .expect(200);
    const file = vaultExportResponseSchema.parse(exported.body).export;
    expect(file.memories).toHaveLength(1);
    expect(file.clients[0]?.hasPolicy).toBe(true);
    expect(exported.text).not.toContain("tokenHash");
    expect(exported.text).not.toContain(client.body.token);
    const empty = await api()
      .get("/v1/data/export")
      .set("Cookie", bob.cookie)
      .expect(200);
    expect(empty.body.export.memories).toEqual([]);
    const preview = await api()
      .post("/v1/data/import/preview")
      .set("Cookie", bob.cookie)
      .send({ export: file })
      .expect(201);
    expect(preview.body.preview.possibleDuplicateMemories).toEqual([]);
    const imported = await api()
      .post("/v1/data/import")
      .set("Cookie", bob.cookie)
      .send({ export: file, mode: "ACTIVE_MEMORIES" })
      .expect(201);
    expect(imported.body.imported).toMatchObject({
      memoriesCreated: 1,
      clientsCreated: 1,
      policiesCreated: 1
    });
    const copy = await prisma.memory.findFirstOrThrow({
      where: { userId: bob.userId }
    });
    expect(copy.id).not.toBe(created.body.memory.id);
    expect(copy).toMatchObject({
      title: file.memories[0]?.title,
      body: file.memories[0]?.body
    });
    expect(
      await prisma.client.findFirstOrThrow({ where: { userId: bob.userId } })
    ).toMatchObject({ tokenHash: null });
    const jobId = imported.body.imported.jobRunId as string;
    await api().get(`/v1/jobs/${jobId}`).set("Cookie", bob.cookie).expect(200);
    await api()
      .get(`/v1/jobs/${jobId}`)
      .set("Cookie", alice.cookie)
      .expect(404);
    await api()
      .patch(`/v1/jobs/${jobId}/retry`)
      .set("Cookie", alice.cookie)
      .send({})
      .expect(404);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { userId: bob.userId }
    });
    await api()
      .get(`/v1/audit-events/${audit.id}`)
      .set("Cookie", alice.cookie)
      .expect(404);
    expect(await prisma.memory.count({ where: { userId: alice.userId } })).toBe(
      1
    );
  });

  it("imports as reviewable suggestions by default and audits their approval", async () => {
    const owner = await createUserWithSession(prisma, "owner@example.com");
    const api = () => request(app.getHttpServer());
    await api()
      .post("/v1/memories")
      .set("Cookie", owner.cookie)
      .send({
        title: "Imported preference",
        body: "Prefer green tea.",
        kind: "PREFERENCE"
      })
      .expect(201);
    const exported = await api()
      .get("/v1/data/export")
      .set("Cookie", owner.cookie)
      .expect(200);
    const imported = await api()
      .post("/v1/data/import")
      .set("Cookie", owner.cookie)
      .send(exported.body)
      .expect(201);
    expect(imported.body.imported).toMatchObject({
      memoriesCreated: 0,
      suggestionsCreated: 1
    });
    const suggestion = await prisma.memorySuggestion.findFirstOrThrow({
      where: { userId: owner.userId }
    });
    await api()
      .patch(`/v1/memory-suggestions/${suggestion.id}/apply`)
      .set("Cookie", owner.cookie)
      .expect(200);
    await api()
      .patch(`/v1/memory-suggestions/${suggestion.id}/apply`)
      .set("Cookie", owner.cookie)
      .expect(409);
    expect(await prisma.memory.count({ where: { userId: owner.userId } })).toBe(
      2
    );
    expect(
      await prisma.auditEvent.count({
        where: { userId: owner.userId, type: "MEMORY_SUGGESTION_APPROVED" }
      })
    ).toBe(1);
  });
});
