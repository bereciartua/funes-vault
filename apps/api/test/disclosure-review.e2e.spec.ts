import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashToken } from "../src/clients/client-token.js";
import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: one-time disclosure review (e2e)", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createE2ePrismaClient>;
  let owner: Awaited<ReturnType<typeof createUserWithSession>>;
  let other: Awaited<ReturnType<typeof createUserWithSession>>;
  let clientId: string;
  let memoryId: string;
  let secondMemoryId: string;
  let policyId: string;
  const token = "fvlt_test_disclosure_review";
  const api = () => request(app.getHttpServer());
  const reviewPath = (id: string) => `/v1/memory-request-reviews/${id}`;
  const result = (id: string, bearer = token) =>
    api()
      .get(`/v1/memory-requests/${id}/result`)
      .set("Authorization", `Bearer ${bearer}`);
  const create = async () => {
    const response = await api()
      .post("/v1/memory-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ purpose: "review", task: "typescript", retention: "NO_STORAGE" })
      .expect(201);
    expect(response.body.status).toBe("NEEDS_USER_APPROVAL");
    expect(response.body.items).toEqual([]);

    return response.body.requestId as string;
  };
  const preview = async (id: string) =>
    (await api().get(reviewPath(id)).set("Cookie", owner.cookie).expect(200))
      .body;
  const approve = async (id: string, body?: { revision: string }) => {
    const current = body ?? (await preview(id));

    return api()
      .patch(reviewPath(id))
      .set("Cookie", owner.cookie)
      .send({
        action: "approve",
        revision: current.revision,
        memoryIds: [memoryId]
      });
  };
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
    owner = await createUserWithSession(prisma, "review-owner@example.com");
    other = await createUserWithSession(prisma, "review-other@example.com");
    const client = await prisma.client.create({
      data: {
        userId: owner.userId,
        name: "Review agent",
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
        purpose: "review",
        operations: ["READ"],
        requiresConfirmation: true,
        maxSensitivity: "INTERNAL"
      }
    });
    policyId = policy.id;
    const memory = await prisma.memory.create({
      data: {
        userId: owner.userId,
        title: "TypeScript preference",
        body: "Use TypeScript for new apps.",
        kind: "PREFERENCE"
      }
    });
    memoryId = memory.id;
    const second = await prisma.memory.create({
      data: {
        userId: owner.userId,
        title: "TypeScript testing",
        body: "Run TypeScript tests.",
        kind: "PREFERENCE"
      }
    });
    secondMemoryId = second.id;
    await prisma.memory.create({
      data: {
        userId: owner.userId,
        title: "TypeScript restricted",
        body: "Restricted project.",
        kind: "PROJECT_CONTEXT",
        sensitivity: "RESTRICTED"
      }
    });
  });

  it("previews only eligible text, approves a subset, consumes once, and audits both steps", async () => {
    const id = await create();
    const list = await api()
      .get("/v1/memory-request-reviews")
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(list.body.items[0].id).toBe(id);
    const view = await preview(id);
    expect(
      view.items.map((i: { memoryId: string }) => i.memoryId).sort()
    ).toEqual([memoryId, secondMemoryId].sort());
    expect(view.request.clientName).toBe("Review agent");
    expect((await approve(id, view)).status).toBe(200);
    expect(
      await prisma.auditEvent.count({
        where: { memoryRequestId: id, type: "MEMORY_DISCLOSURE" }
      })
    ).toBe(0);
    const retrieved = await result(id).expect(200);
    expect(retrieved.body.items).toHaveLength(1);
    expect(retrieved.body.items[0].text).toBe(
      view.items.find((i: { memoryId: string }) => i.memoryId === memoryId).text
    );
    expect((await result(id)).body.items).toEqual([]);
    expect(
      await prisma.auditEvent.count({
        where: { memoryRequestId: id, type: "MEMORY_REQUEST_APPROVED" }
      })
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { memoryRequestId: id, type: "MEMORY_DISCLOSURE" }
      })
    ).toBe(1);
  });

  it("isolates review and retrieval by both user and client", async () => {
    const id = await create();
    await api().get(reviewPath(id)).expect(401);
    await api()
      .get(reviewPath(id))
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    await api().get(reviewPath(id)).set("Cookie", other.cookie).expect(404);
    await api()
      .patch(reviewPath(id))
      .set("Cookie", other.cookie)
      .send({ action: "deny" })
      .expect(404);
    await prisma.client.create({
      data: {
        userId: owner.userId,
        name: "Another agent",
        type: "MCP_CLIENT",
        tokenHash: hashToken("fvlt_other_agent")
      }
    });
    await result(id, "fvlt_other_agent").expect(404);
    expect((await result(id)).body.items).toEqual([]);
  });

  it("rejects a stale preview or an unpreviewed selection", async () => {
    const id = await create();
    const view = await preview(id);
    await api()
      .patch(reviewPath(id))
      .set("Cookie", owner.cookie)
      .send({
        action: "approve",
        revision: view.revision,
        memoryIds: ["unpreviewed"]
      })
      .expect(409);
    await prisma.memory.update({
      where: { id: memoryId },
      data: { body: "Changed TypeScript preference." }
    });
    expect((await approve(id, view)).status).toBe(409);
    expect((await approve(id)).status).toBe(200);
  });

  it.each(["memory", "policy", "client", "expiry", "archive", "memory-expiry"])(
    "invalidates approval after %s changes",
    async (change) => {
      const id = await create();
      expect((await approve(id)).status).toBe(200);
      if (change === "memory") {
        await prisma.memory.update({
          where: { id: memoryId },
          data: { body: "Updated text." }
        });
      }
      if (change === "archive") {
        await prisma.memory.update({
          where: { id: memoryId },
          data: { status: "ARCHIVED" }
        });
      }
      if (change === "memory-expiry") {
        await prisma.memory.update({
          where: { id: memoryId },
          data: { expiresAt: new Date(0) }
        });
      }
      if (change === "policy") {
        await prisma.policy.update({
          where: { id: policyId },
          data: { operations: [] }
        });
      }
      if (change === "client") {
        await prisma.client.update({
          where: { id: clientId },
          data: { trustLevel: "BLOCKED" }
        });
      }
      if (change === "expiry") {
        await prisma.memoryRequest.update({
          where: { id },
          data: { approvalExpiresAt: new Date(0) }
        });
      }
      const response = await result(id).expect(200);
      expect(response.body.status).toBe("NEEDS_USER_APPROVAL");
      expect(response.body.items).toEqual([]);
      expect(
        await prisma.auditEvent.count({
          where: { memoryRequestId: id, type: "MEMORY_DISCLOSURE" }
        })
      ).toBe(0);
    }
  );

  it("denies without disclosure and prevents competing approvals or consumption", async () => {
    const denied = await create();
    await api()
      .patch(reviewPath(denied))
      .set("Cookie", owner.cookie)
      .send({ action: "deny" })
      .expect(200);
    expect((await result(denied)).body.status).toBe("DENIED");
    const id = await create();
    const view = await preview(id);
    const decisions = await Promise.all([approve(id, view), approve(id, view)]);
    expect(decisions.map((r) => r.status).sort()).toEqual([200, 409]);
    const results = await Promise.all([result(id), result(id)]);
    expect(results.map((r) => r.body.items.length).sort()).toEqual([0, 1]);
    expect(
      await prisma.auditEvent.count({
        where: { memoryRequestId: id, type: "MEMORY_DISCLOSURE" }
      })
    ).toBe(1);
  });
});
