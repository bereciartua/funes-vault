import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: client token auth (e2e)", () => {
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

  it("authenticates memory-bundle requests with the client bearer token", async () => {
    const server = app.getHttpServer();
    const user = await createUserWithSession(prisma, "owner@example.com");

    const created = await request(server)
      .post("/v1/clients")
      .set("Cookie", user.cookie)
      .send({ name: "E2E Assistant" })
      .expect(201);
    const token = created.body.token as string;
    expect(token).toBeTruthy();
    expect(created.body.client.hasToken).toBe(true);

    // Stored form must be a hash, never the token itself.
    const stored = await prisma.client.findFirst({
      where: { userId: user.userId }
    });
    expect(stored?.tokenHash).toBeTruthy();
    expect(stored?.tokenHash).not.toBe(token);

    const bundle = await request(server)
      .post("/v1/memory-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({
        purpose: "coding_help",
        task: "Summarize the user's coding preferences.",
        requestedCategories: []
      });
    expect([200, 201]).toContain(bundle.status);

    await request(server)
      .post("/v1/memory-requests")
      .set("Authorization", "Bearer not-a-real-token")
      .send({
        purpose: "coding_help",
        task: "Summarize the user's coding preferences.",
        requestedCategories: []
      })
      .expect(401);

    await request(server)
      .post("/v1/memory-requests")
      .send({
        purpose: "coding_help",
        task: "Summarize the user's coding preferences.",
        requestedCategories: []
      })
      .expect(401);
  });
});
