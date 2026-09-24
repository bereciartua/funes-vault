import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashToken } from "../src/clients/client-token.js";
import { FirstPartyAccessService } from "../src/first-party-access/first-party-access.service.js";
import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";
describe("privacy: app permissions and stated purpose", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createE2ePrismaClient>;
  let owner: Awaited<ReturnType<typeof createUserWithSession>>;
  let clientId: string;
  let policyId: string;
  let memoryId: string;
  const token = "fvlt_permissions_test";
  const api = () => request(app.getHttpServer());
  const read = (purpose?: unknown, task = "favorite color") =>
    api()
      .post("/v1/memory-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ task, ...(purpose === undefined ? {} : { purpose }) });
  const suggest = (sourceMetadata = {}, purpose?: string) =>
    api()
      .post("/v1/memory-suggestions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Color preference",
        body: "Favorite color is blue.",
        purpose,
        sourceMetadata
      });
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
    owner = await createUserWithSession(prisma, "permissions@example.test");
    const client = await prisma.client.create({
      data: {
        userId: owner.userId,
        name: "Connected app",
        type: "MCP_CLIENT",
        trustLevel: "APPROVED",
        tokenHash: hashToken(token)
      }
    });
    clientId = client.id;
    const policy = await prisma.policy.create({
      data: {
        userId: owner.userId,
        clientId,
        operations: ["READ", "SUGGEST"],
        requiresConfirmation: false
      }
    });
    policyId = policy.id;
    const memory = await prisma.memory.create({
      data: {
        userId: owner.userId,
        title: "Favorite color",
        body: "Favorite color is blue.",
        kind: "PREFERENCE"
      }
    });
    memoryId = memory.id;
  });
  it("keeps decisions, ranking and authority identical for every stated purpose", async () => {
    let items: unknown;
    for (const purpose of [
      undefined,
      null,
      "  Answer the user's color question  ",
      "mcp_connector",
      "   ",
      "<b>My Reason</b>"
    ]) {
      const response = await read(purpose).expect(201);
      expect(response.body).toMatchObject({
        status: "FULFILLED",
        policyId,
        reason: null
      });
      items ??= response.body.items;
      expect(response.body.items).toEqual(items);
      const row = await prisma.memoryRequest.findUniqueOrThrow({
        where: { id: response.body.requestId }
      });
      expect(row.statedPurpose).toBe(
        typeof purpose === "string" ? purpose.trim() || null : null
      );
      expect(row.policyVersion).toBeTruthy();
      const audit = await prisma.auditEvent.findUniqueOrThrow({
        where: { id: response.body.auditEventId }
      });
      expect(audit.metadata).toMatchObject({
        statedPurpose: row.statedPurpose,
        policyId,
        policyVersion: row.policyVersion
      });
    }
    for (const purpose of [42, {}, "x".repeat(161)]) {
      await read(purpose).expect(400);
    }
  });
  it.each(["blocked", "missing", "expired", "operation"])(
    "denies %s before retrieving memory identifiers",
    async (state) => {
      if (state === "blocked") {
        await prisma.client.update({
          where: { id: clientId },
          data: { trustLevel: "BLOCKED" }
        });
      }
      if (state === "missing") {
        await prisma.policy.delete({ where: { id: policyId } });
      }
      if (state === "expired") {
        await prisma.policy.update({
          where: { id: policyId },
          data: { expiresAt: new Date(0) }
        });
      }
      if (state === "operation") {
        await prisma.policy.update({
          where: { id: policyId },
          data: { operations: ["SUGGEST"] }
        });
      }
      const reasons = {
        blocked: "unknown_or_blocked_client",
        missing: "no_client_policy",
        expired: "policy_expired",
        operation: "operation_not_allowed"
      };
      const response = await read("anything").expect(201);
      expect(response.body).toMatchObject({
        status: "DENIED",
        reason: reasons[state as keyof typeof reasons],
        denied: [],
        items: []
      });
      expect(JSON.stringify(response.body)).not.toContain(memoryId);
      expect(
        await prisma.auditEvent.count({
          where: {
            memoryRequestId: response.body.requestId,
            type: "MEMORY_REQUEST_DENIED"
          }
        })
      ).toBe(1);
      expect(
        await prisma.auditEvent.count({
          where: {
            memoryRequestId: response.body.requestId,
            type: "MEMORY_DISCLOSURE"
          }
        })
      ).toBe(0);
    }
  );
  it("distinguishes no matches from filtered matches and missing permissions on an empty vault", async () => {
    await prisma.memory.update({
      where: { id: memoryId },
      data: { sensitivity: "SECRET" }
    });
    expect((await read()).body.reason).toBe("no_allowed_memories");
    await prisma.memory.deleteMany();
    expect((await read()).body.reason).toBe("no_matching_memories");
    await prisma.policy.delete({ where: { id: policyId } });
    expect((await read()).body.reason).toBe("no_client_policy");
  });
  it("isolates caller dispatch keys and requires WRITE for immediate application", async () => {
    const queued = await suggest(
      {
        action: "archive_memory",
        targetMemoryId: memoryId,
        captureId: "capture_test_123"
      },
      "memory_chat"
    ).expect(201);
    expect(queued.body.status).toBe("QUEUED_FOR_REVIEW");
    const stored = await prisma.memorySuggestion.findUniqueOrThrow({
      where: { id: queued.body.suggestionId }
    });
    expect(stored).toMatchObject({
      policyId,
      statedPurpose: "memory_chat",
      sourceMetadata: {
        caller: { action: "archive_memory", targetMemoryId: memoryId }
      }
    });
    expect(stored.sourceMetadata).not.toHaveProperty("action");
    await api()
      .patch(`/v1/memory-suggestions/${stored.id}/apply`)
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(
      (await prisma.memory.findUniqueOrThrow({ where: { id: memoryId } }))
        .status
    ).toBe("ACTIVE");
    const capture = await api()
      .post("/v1/captures")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "Another color note", captureId: "capture_test_123" })
      .expect(201);
    expect(capture.body.deduplicated).toBe(false);
    expect(
      await prisma.memorySuggestion.findUniqueOrThrow({
        where: { id: capture.body.suggestionId }
      })
    ).toMatchObject({ policyId });
    await prisma.policy.update({
      where: { id: policyId },
      data: { operations: ["READ", "SUGGEST", "WRITE"] }
    });
    expect((await suggest({}, "arbitrary reason")).body.status).toBe("APPLIED");
    await prisma.policy.update({
      where: { id: policyId },
      data: { operations: ["READ"] }
    });
    const denied = await suggest().expect(201);
    expect(denied.body).toMatchObject({
      status: "DENIED",
      reason: "operation_not_allowed"
    });
    expect(
      (
        await prisma.auditEvent.findUniqueOrThrow({
          where: { id: denied.body.auditEventId }
        })
      ).type
    ).toBe("MEMORY_SUGGESTION_DENIED");
  });
  it("does not revive an approved request after permission removal and recreation", async () => {
    await prisma.policy.update({
      where: { id: policyId },
      data: { requiresConfirmation: true }
    });
    const pending = (await read()).body;
    const path = `/v1/memory-request-reviews/${pending.requestId}`;
    const preview = (await api().get(path).set("Cookie", owner.cookie)).body;
    await api()
      .patch(path)
      .set("Cookie", owner.cookie)
      .send({
        action: "approve",
        revision: preview.revision,
        memoryIds: [memoryId]
      })
      .expect(200);
    await prisma.policy.delete({ where: { id: policyId } });
    await prisma.policy.create({
      data: { userId: owner.userId, clientId, operations: ["READ"] }
    });
    const result = await api()
      .get(`/v1/memory-requests/${pending.requestId}/result`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(result.body).toMatchObject({
      status: "NEEDS_USER_APPROVAL",
      policyId: null,
      reason: "policy_changed",
      items: []
    });
    const orphan = (await api().get(path).set("Cookie", owner.cookie)).body;
    expect(orphan.canApprove).toBe(false);
    await api()
      .patch(path)
      .set("Cookie", owner.cookie)
      .send({
        action: "approve",
        revision: orphan.revision,
        memoryIds: [memoryId]
      })
      .expect(409);
    await api()
      .patch(path)
      .set("Cookie", owner.cookie)
      .send({ action: "deny" })
      .expect(200);
  });
  it("enforces one owner-bound permission set, rejects moves and races", async () => {
    const other = await createUserWithSession(prisma, "other@example.test");
    await expect(
      prisma.policy.update({
        where: { id: policyId },
        data: { userId: other.userId }
      })
    ).rejects.toThrow();
    await api()
      .patch(`/v1/policies/${policyId}`)
      .set("Cookie", owner.cookie)
      .send({ clientId: "foreign", operations: ["READ"] })
      .expect(400);
    await prisma.policy.delete({ where: { id: policyId } });
    const create = () =>
      api().post("/v1/policies").set("Cookie", owner.cookie).send({ clientId });
    const responses = await Promise.all([create(), create()]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(responses.find((r) => r.status === 409)?.body.message).toBe(
      "This app already has permissions"
    );
  });
  it.each(["web", "voice"])(
    "explicitly restores %s defaults on the same client and audits them",
    async (channel) => {
      const access = app.get(FirstPartyAccessService);
      const ensure = () =>
        channel === "web"
          ? access.ensureWebChatAccess(owner.userId)
          : access.ensureVoiceAccess(owner.userId);
      const initial = await ensure();
      const original = await prisma.policy.findUniqueOrThrow({
        where: { id: initial.policyId! }
      });
      await prisma.policy.delete({ where: { id: initial.policyId! } });
      expect(await ensure()).toEqual({
        clientId: initial.clientId,
        policyId: null
      });
      const path = `/v1/policies/defaults/${initial.clientId}`;
      const foreign = await createUserWithSession(
        prisma,
        "foreign@example.test"
      );
      await api().post(path).set("Cookie", foreign.cookie).expect(404);
      const restored = await api()
        .post(path)
        .set("Cookie", owner.cookie)
        .expect(201);
      expect(restored.body.policy).toMatchObject({
        clientId: initial.clientId,
        maxSensitivity: original.maxSensitivity,
        operations: original.operations,
        requiresConfirmation: original.requiresConfirmation
      });
      await api().post(path).set("Cookie", owner.cookie).expect(409);
      const events = await prisma.auditEvent.findMany({
        where: {
          clientId: initial.clientId,
          type: "POLICY_CREATED",
          actorType: "USER"
        }
      });
      expect(events).toHaveLength(1);
      const initialEvent = await prisma.auditEvent.findFirstOrThrow({
        where: {
          clientId: initial.clientId,
          type: "POLICY_CREATED",
          actorType: "SYSTEM"
        }
      });
      const facts = {
        firstPartyDefault: channel === "web" ? "web_chat" : "voice",
        operations: original.operations,
        maxSensitivity: original.maxSensitivity,
        requiresConfirmation: original.requiresConfirmation,
        allowedCategoryCount: await prisma.memoryCategory.count()
      };
      expect(events[0]?.metadata).toMatchObject(facts);
      expect(initialEvent.metadata).toMatchObject(facts);
    }
  );
  it("never runs first-party chat under a connected app with the same name", async () => {
    await prisma.client.update({
      where: { id: clientId },
      data: { name: "Funes Vault Web Chat" }
    });
    await expect(
      app.get(FirstPartyAccessService).ensureWebChatAccess(owner.userId)
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.client.findUniqueOrThrow({ where: { id: clientId } })
    ).toMatchObject({ type: "MCP_CLIENT" });
    expect(
      await prisma.policy.findUniqueOrThrow({ where: { id: policyId } })
    ).toMatchObject({ operations: ["READ", "SUGGEST"] });
  });
  it("rejects defaults on connected or missing apps", async () => {
    await api()
      .post(`/v1/policies/defaults/${clientId}`)
      .set("Cookie", owner.cookie)
      .expect(400);
    await api()
      .post("/v1/policies/defaults/missing")
      .set("Cookie", owner.cookie)
      .expect(404);
  });
});
