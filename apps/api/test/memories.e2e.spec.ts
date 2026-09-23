import { AuditEventType, MemoryStatus } from "@funes-vault/db";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  fakeVector,
  insertEmbedding,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: memories (e2e)", () => {
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

  it("runs a full create/read/update/delete round trip with audit events", async () => {
    const server = app.getHttpServer();
    const user = await createUserWithSession(prisma, "crud@example.com");

    const created = await request(server)
      .post("/v1/memories")
      .set("Cookie", user.cookie)
      .send({
        kind: "PREFERENCE",
        title: "Prefers concise answers",
        body: "The user prefers concise technical answers.",
        categoryKeys: []
      })
      .expect(201);
    const memoryId = created.body.memory.id as string;

    const updated = await request(server)
      .patch(`/v1/memories/${memoryId}`)
      .set("Cookie", user.cookie)
      .send({ title: "Prefers very concise answers" })
      .expect(200);
    expect(updated.body.memory.title).toBe("Prefers very concise answers");

    await request(server)
      .delete(`/v1/memories/${memoryId}`)
      .set("Cookie", user.cookie)
      .expect(200);

    const memory = await prisma.memory.findUnique({ where: { id: memoryId } });
    expect(memory?.status).toBe(MemoryStatus.DELETED);

    const auditTypes = (
      await prisma.auditEvent.findMany({ where: { userId: user.userId } })
    ).map((event) => event.type);
    expect(auditTypes).toEqual(
      expect.arrayContaining([
        AuditEventType.MEMORY_CREATED,
        AuditEventType.MEMORY_UPDATED,
        AuditEventType.MEMORY_DELETED
      ])
    );
  });

  it("returns field-level validation errors without echoing values", async () => {
    const server = app.getHttpServer();
    const user = await createUserWithSession(prisma, "invalid@example.com");

    const response = await request(server)
      .post("/v1/memories")
      .set("Cookie", user.cookie)
      .send({
        kind: "NOT_A_KIND",
        title: "",
        body: "some-body-value-that-must-not-echo",
        categoryKeys: []
      })
      .expect(400);

    expect(response.body.message).toBe("Invalid request");
    expect(Object.keys(response.body.errors)).toEqual(
      expect.arrayContaining(["kind", "title"])
    );
    expect(response.body.requestId).toBeDefined();
    expect(response.headers["x-request-id"]).toBe(response.body.requestId);
    expect(JSON.stringify(response.body)).not.toContain(
      "some-body-value-that-must-not-echo"
    );
  });

  it("refuses to store secret-like content", async () => {
    const server = app.getHttpServer();
    const user = await createUserWithSession(prisma, "secrets@example.com");

    const response = await request(server)
      .post("/v1/memories")
      .set("Cookie", user.cookie)
      .send({
        kind: "FACT",
        title: "API key",
        body: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
        categoryKeys: []
      })
      .expect(400);

    expect(response.body.findings).toContain("assigned_secret");
    expect(await prisma.memory.count()).toBe(0);
    const memory = await prisma.memory.create({
      data: {
        userId: user.userId,
        kind: "FACT",
        title: "Safe memory",
        body: "A harmless preference."
      }
    });
    for (const action of [
      () =>
        request(server)
          .patch(`/v1/memories/${memory.id}`)
          .send({ body: "password=synthetic-secret-value" }),
      () =>
        request(server)
          .post("/v1/captures")
          .send({ text: "password=synthetic-secret-value" })
    ]) {
      const rejected = await action().set("Cookie", user.cookie).expect(400);
      expect(rejected.text).not.toContain("synthetic-secret-value");
    }
    expect(
      (await prisma.memory.findUniqueOrThrow({ where: { id: memory.id } })).body
    ).toBe("A harmless preference.");
    expect(await prisma.memorySuggestion.count()).toBe(0);
  });

  it("ranks semantic matches through the real pgvector query", async () => {
    const server = app.getHttpServer();
    const user = await createUserWithSession(prisma, "semantic@example.com");

    const typed = await request(server)
      .post("/v1/memories")
      .set("Cookie", user.cookie)
      .send({
        kind: "PREFERENCE",
        title: "Strong typing",
        body: "Likes strongly typed languages.",
        categoryKeys: []
      })
      .expect(201);
    const cooking = await request(server)
      .post("/v1/memories")
      .set("Cookie", user.cookie)
      .send({
        kind: "PREFERENCE",
        title: "Cooking",
        body: "Enjoys cooking pasta.",
        categoryKeys: []
      })
      .expect(201);

    // The fake provider embeds anything mentioning "typescript" on axis 0;
    // give the typing memory that axis and the cooking memory axis 1.
    await insertEmbedding(prisma, {
      userId: user.userId,
      memoryId: typed.body.memory.id as string,
      vector: fakeVector(0)
    });
    await insertEmbedding(prisma, {
      userId: user.userId,
      memoryId: cooking.body.memory.id as string,
      vector: fakeVector(1)
    });

    const response = await request(server)
      .get("/v1/memories")
      .query({ query: "typescript" })
      .set("Cookie", user.cookie)
      .expect(200);

    const ids = response.body.items.map(
      (item: { id: string }) => item.id
    ) as string[];
    expect(ids).toContain(typed.body.memory.id);
    expect(ids).not.toContain(cooking.body.memory.id);
  });
});
