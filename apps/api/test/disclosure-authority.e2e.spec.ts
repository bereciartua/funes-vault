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

import { hashToken } from "../src/clients/client-token.js";
import { RetrievalService } from "../src/memory-requests/retrieval.service.js";
import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: disclosure authority regressions", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createE2ePrismaClient>;
  let owner: Awaited<ReturnType<typeof createUserWithSession>>;
  let policyId: string;
  let memoryId: string;
  const token = "fvlt_disclosure_authority_test";
  const api = () => request(app.getHttpServer());
  const preview = async (id: string) =>
    (
      await api()
        .get(`/v1/memory-request-reviews/${id}`)
        .set("Cookie", owner.cookie)
        .expect(200)
    ).body;
  const read = async () =>
    (
      await api()
        .post("/v1/memory-requests")
        .set("Authorization", `Bearer ${token}`)
        .send({ task: "color", purpose: "Answer the user’s question" })
        .expect(201)
    ).body;
  const result = async (id: string) =>
    (
      await api()
        .get(`/v1/memory-requests/${id}/result`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
    ).body;
  const approve = (id: string, revision: string) =>
    api()
      .patch(`/v1/memory-request-reviews/${id}`)
      .set("Cookie", owner.cookie)
      .send({ action: "approve", revision, memoryIds: [memoryId] });
  const denials = (id: string) =>
    prisma.auditEvent.findMany({
      where: { memoryRequestId: id, type: "MEMORY_REQUEST_DENIED" }
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
    vi.restoreAllMocks();
    await resetTestDatabase(prisma);
    owner = await createUserWithSession(
      prisma,
      "disclosure-authority@example.test"
    );
    const client = await prisma.client.create({
      data: {
        userId: owner.userId,
        name: "Color app",
        type: "MCP_CLIENT",
        trustLevel: "APPROVED",
        tokenHash: hashToken(token)
      }
    });
    policyId = (
      await prisma.policy.create({
        data: {
          userId: owner.userId,
          clientId: client.id,
          operations: ["READ"],
          requiresConfirmation: true
        }
      })
    ).id;
    memoryId = (
      await prisma.memory.create({
        data: {
          userId: owner.userId,
          title: "Favorite color",
          body: "The favorite color is blue.",
          kind: "PREFERENCE"
        }
      })
    ).id;
  });
  it("audits one policy change across consumption and fresh preview and rebinds the version", async () => {
    const pending = await read();
    await approve(
      pending.requestId,
      (await preview(pending.requestId)).revision
    ).expect(200);
    const changed = await prisma.policy.update({
      where: { id: policyId },
      data: { maxSensitivity: "LOW" }
    });
    expect(await result(pending.requestId)).toMatchObject({
      status: "NEEDS_USER_APPROVAL",
      reason: "policy_changed"
    });
    const refreshed = await preview(pending.requestId);
    expect(refreshed.request.policyVersion).toBe(
      changed.updatedAt.toISOString()
    );
    expect(refreshed.canApprove).toBe(true);
    const events = await denials(pending.requestId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorType: "SYSTEM",
      metadata: { reason: "policy_changed" }
    });
  });
  it("rebinds a pending preview once and does not audit stale clicks", async () => {
    const pending = await read();
    const old = await preview(pending.requestId);
    const changed = await prisma.policy.update({
      where: { id: policyId },
      data: { maxSensitivity: "LOW" }
    });
    await approve(pending.requestId, old.revision).expect(409);
    expect(await denials(pending.requestId)).toHaveLength(0);
    const fresh = await preview(pending.requestId);
    expect(fresh.request.policyVersion).toBe(changed.updatedAt.toISOString());
    expect(await denials(pending.requestId)).toHaveLength(1);
    await approve(pending.requestId, fresh.revision).expect(200);
  });
  it("inspects the approved snapshot without fresh retrieval or state changes", async () => {
    const pending = await read();
    const view = await preview(pending.requestId);
    await approve(pending.requestId, view.revision).expect(200);
    const retrieve = vi
      .spyOn(app.get(RetrievalService), "retrieve")
      .mockRejectedValue(new Error("semantic provider unavailable"));
    const approved = await preview(pending.requestId);
    expect(approved.items).toEqual(view.items);
    expect(approved.request.status).toBe("APPROVED");
    expect(retrieve).not.toHaveBeenCalled();
    expect(await denials(pending.requestId)).toHaveLength(0);
    expect((await result(pending.requestId)).items).toHaveLength(1);
  });
  it("expires approvals without reporting a policy change", async () => {
    const pending = await read();
    await approve(
      pending.requestId,
      (await preview(pending.requestId)).revision
    ).expect(200);
    await prisma.memoryRequest.update({
      where: { id: pending.requestId },
      data: { approvalExpiresAt: new Date(0) }
    });
    expect(await result(pending.requestId)).toMatchObject({
      status: "NEEDS_USER_APPROVAL",
      reason: null,
      items: []
    });
    expect(await denials(pending.requestId)).toHaveLength(0);
  });
  it("uses the same metadata shape for immediate and single-use disclosures", async () => {
    const pending = await read();
    await approve(
      pending.requestId,
      (await preview(pending.requestId)).revision
    ).expect(200);
    const approved = await result(pending.requestId);
    await prisma.policy.update({
      where: { id: policyId },
      data: { requiresConfirmation: false }
    });
    const immediate = await read();
    const events = await Promise.all(
      [approved, immediate].map((response) =>
        prisma.auditEvent.findUniqueOrThrow({
          where: { id: response.auditEventId }
        })
      )
    );
    expect(Object.keys(events[0]!.metadata as object).sort()).toEqual(
      Object.keys(events[1]!.metadata as object).sort()
    );
    for (const event of events) {
      expect(event.metadata).toMatchObject({
        statedPurpose: "Answer the user’s question",
        policyId,
        reason: null
      });
    }
  });
});
