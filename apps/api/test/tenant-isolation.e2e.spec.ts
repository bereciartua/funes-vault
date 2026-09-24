import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: tenant isolation (e2e)", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createE2ePrismaClient>;

  beforeAll(async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
    vi.stubEnv("TYPESAFE_API_KEY", "synthetic-test-key");
    app = await createE2eApp();
    prisma = createE2ePrismaClient();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  it("never exposes one user's memories to another over HTTP", async () => {
    const server = app.getHttpServer();
    const alice = await createUserWithSession(prisma, "alice@example.com");
    const bob = await createUserWithSession(prisma, "bob@example.com");

    const created = await request(server)
      .post("/v1/memories")
      .set("Cookie", alice.cookie)
      .send({
        kind: "PREFERENCE",
        title: "Alice prefers dark mode",
        body: "Alice always uses dark mode in editors.",
        categoryKeys: []
      })
      .expect(201);
    const memoryId = created.body.memory.id as string;

    // Direct reads by id must 404, not 403 — existence itself is private.
    await request(server)
      .get(`/v1/memories/${memoryId}`)
      .set("Cookie", bob.cookie)
      .expect(404);
    await request(server)
      .get(`/v1/memories/${memoryId}/provenance`)
      .set("Cookie", bob.cookie)
      .expect(404);
    await request(server)
      .patch(`/v1/memories/${memoryId}`)
      .set("Cookie", bob.cookie)
      .send({ title: "Hijacked" })
      .expect(404);
    await request(server)
      .delete(`/v1/memories/${memoryId}`)
      .set("Cookie", bob.cookie)
      .expect(404);

    const bobList = await request(server)
      .get("/v1/memories")
      .set("Cookie", bob.cookie)
      .expect(200);
    expect(bobList.body.items).toEqual([]);

    const bobSearch = await request(server)
      .get("/v1/memories")
      .query({ query: "dark mode" })
      .set("Cookie", bob.cookie)
      .expect(200);
    expect(bobSearch.body.items).toEqual([]);

    const aliceGet = await request(server)
      .get(`/v1/memories/${memoryId}`)
      .set("Cookie", alice.cookie)
      .expect(200);
    expect(aliceGet.body.memory.title).toBe("Alice prefers dark mode");
  });
  it("isolates clients, policies, and suggestion review mutations", async () => {
    const alice = await createUserWithSession(prisma, "alice@example.com");
    const bob = await createUserWithSession(prisma, "bob@example.com");
    const api = () => request(app.getHttpServer());
    const client = await prisma.client.create({
      data: { userId: alice.userId, name: "Private agent", type: "OTHER" }
    });
    const policy = await prisma.policy.create({
      data: {
        userId: alice.userId,
        clientId: client.id,
        operations: ["READ"]
      }
    });
    const suggestion = await prisma.memorySuggestion.create({
      data: {
        userId: alice.userId,
        title: "Private suggestion",
        body: "Private content",
        suggestedKind: "PREFERENCE",
        sourceType: "MANUAL"
      }
    });
    await prisma.auditEvent.create({
      data: {
        userId: alice.userId,
        type: "CLIENT_CREATED",
        actorType: "USER",
        actorId: alice.userId
      }
    });
    await prisma.memoryRequest.create({
      data: {
        userId: alice.userId,
        clientId: client.id,
        statedPurpose: "private",
        task: "Private review",
        status: "NEEDS_USER_APPROVAL",
        requestedCategories: [],
        tokenBudget: 1000
      }
    });
    for (const path of ["/v1/audit-events", "/v1/memory-request-reviews"]) {
      const owned = await api()
        .get(path)
        .set("Cookie", alice.cookie)
        .expect(200);
      expect(owned.body.items).toHaveLength(1);
    }
    for (const [path, body] of [
      [`/v1/clients/${client.id}`, { name: "Hijacked" }],
      [`/v1/policies/${policy.id}`, { operations: ["EXPORT"] }],
      [`/v1/memory-suggestions/${suggestion.id}/apply`, {}],
      [`/v1/memory-suggestions/${suggestion.id}/reject`, {}]
    ] as const) {
      await api().patch(path).set("Cookie", bob.cookie).send(body).expect(404);
    }
    for (const path of [
      `/v1/clients/${client.id}`,
      `/v1/policies/${policy.id}`
    ]) {
      await api().delete(path).set("Cookie", bob.cookie).expect(404);
    }
    for (const path of [
      "/v1/clients",
      "/v1/policies",
      "/v1/memory-suggestions",
      "/v1/audit-events",
      "/v1/memory-request-reviews"
    ]) {
      const response = await api()
        .get(path)
        .set("Cookie", bob.cookie)
        .expect(200);
      expect(response.body.items).toEqual([]);
    }
    await api()
      .post("/v1/policies")
      .set("Cookie", bob.cookie)
      .send({ clientId: client.id })
      .expect(400);
    expect(
      await prisma.memorySuggestion.findUniqueOrThrow({
        where: { id: suggestion.id }
      })
    ).toMatchObject({ status: "QUEUED_FOR_REVIEW", userId: alice.userId });
  });

  it("isolates chat threads, voice sessions, source turns, and provider choices", async () => {
    const alice = await createUserWithSession(prisma, "alice@example.com");
    const bob = await createUserWithSession(prisma, "bob@example.com");
    const api = () => request(app.getHttpServer());
    const thread = await prisma.chatSession.create({
      data: { userId: alice.userId, title: "Private thread" }
    });
    const source = await prisma.chatMessage.create({
      data: {
        userId: alice.userId,
        sessionId: thread.id,
        role: "USER",
        content: "Private source"
      }
    });
    const voice = await prisma.voiceSession.create({
      data: {
        userId: alice.userId,
        chatSessionId: thread.id,
        model: "test-model"
      }
    });
    await api()
      .get(`/v1/chat/threads/${thread.id}`)
      .set("Cookie", bob.cookie)
      .expect(404);
    await api()
      .patch(`/v1/chat/threads/${thread.id}`)
      .set("Cookie", bob.cookie)
      .send({ title: "Hijacked" })
      .expect(404);
    await api()
      .patch(`/v1/chat/voice-sessions/${voice.id}/end`)
      .set("Cookie", bob.cookie)
      .send({})
      .expect(404);
    await api()
      .post(`/v1/chat/voice-sessions/${voice.id}/turns`)
      .set("Cookie", bob.cookie)
      .send({ role: "user", content: "Hijacked", itemId: "item-test" })
      .expect(404);
    await api()
      .get(`/v1/memory-processing/sources/${source.id}`)
      .set("Cookie", bob.cookie)
      .expect(404);
    await api()
      .post(`/v1/memory-processing/sources/${source.id}/retry`)
      .set("Cookie", bob.cookie)
      .send({})
      .expect(404);
    await api()
      .post(`/v1/memory-processing/sources/${source.id}/reprocess`)
      .set("Cookie", bob.cookie)
      .send({})
      .expect(404);
    const owned = await api()
      .get(`/v1/memory-processing/sources/${source.id}`)
      .set("Cookie", alice.cookie)
      .expect(200);
    expect(owned.body.status).toBe("pending");
    await api()
      .post("/v1/memory-processing/provider")
      .set("Cookie", alice.cookie)
      .send({ scope: "extraction", system: "system_2" })
      .expect(201);
    const capabilities = await api()
      .get("/v1/memory-processing/capabilities")
      .set("Cookie", bob.cookie)
      .expect(200);
    expect(capabilities.body.extraction.system).toBe("system_1");
    await api()
      .post("/v1/memory-processing/provider")
      .set("Cookie", bob.cookie)
      .send({
        scope: "extraction",
        system: "system_1",
        userId: alice.userId
      })
      .expect(201);
    const preference =
      await prisma.processingProviderPreference.findFirstOrThrow({
        where: { userId: alice.userId }
      });
    expect(preference.system).toBe("system_2");
    const aliceCapabilities = await api()
      .get("/v1/memory-processing/capabilities")
      .set("Cookie", alice.cookie)
      .expect(200);
    expect(aliceCapabilities.body.extraction.system).toBe("system_2");
    expect(aliceCapabilities.body.consolidation.system).toBe("system_1");
    expect(
      await prisma.voiceSession.findUniqueOrThrow({ where: { id: voice.id } })
    ).toMatchObject({ endedAt: null });
    const threads = await api()
      .get("/v1/chat/threads")
      .set("Cookie", bob.cookie)
      .expect(200);
    expect(threads.body.items).toEqual([]);
  });

  it("scopes capture idempotency to the owner and leaves captures reviewable", async () => {
    const alice = await createUserWithSession(prisma, "alice@example.com");
    const bob = await createUserWithSession(prisma, "bob@example.com");
    const capture = (cookie: string) =>
      request(app.getHttpServer())
        .post("/v1/captures")
        .set("Cookie", cookie)
        .send({
          text: "Remember to prefer green tea.",
          captureId: "shared-device-id"
        });
    await request(app.getHttpServer())
      .post("/v1/captures")
      .set("Cookie", bob.cookie)
      .set("x-funes-owner-id", alice.userId)
      .send({
        text: "Alice offline capture must never enter Bob vault",
        captureId: "changed-owner-capture"
      })
      .expect(403);
    expect(await prisma.memorySuggestion.count()).toBe(0);
    const original = await capture(alice.cookie).expect(201);
    const duplicate = await capture(alice.cookie).expect(201);
    const other = await capture(bob.cookie).expect(201);
    expect(duplicate.body).toMatchObject({
      suggestionId: original.body.suggestionId,
      deduplicated: true
    });
    expect(other.body.suggestionId).not.toBe(original.body.suggestionId);
    expect(other.body.status).toBe("QUEUED_FOR_REVIEW");
    await request(app.getHttpServer())
      .patch(`/v1/memory-suggestions/${original.body.suggestionId}/apply`)
      .set("Cookie", bob.cookie)
      .expect(404);
    expect(await prisma.memory.count()).toBe(0);
  });
});
