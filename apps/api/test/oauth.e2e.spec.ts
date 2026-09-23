import { createHash } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";

const redirectUri = "http://localhost:8765/callback";
const verifier = "a".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");

describe("privacy: OAuth connector authorization (e2e)", () => {
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

  it("requires consent and PKCE, issues hashed tokens, and revokes a replayed code's tokens", async () => {
    const owner = await createUserWithSession(prisma, "owner@example.com");
    const api = () => request(app.getHttpServer());
    const registration = await api()
      .post("/register")
      .send({
        client_name: "Test connector",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"]
      })
      .expect(201);
    const clientId = registration.body.client_id as string;
    const authorization = await api()
      .get("/authorize")
      .query({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "test-state"
      })
      .expect(302);
    const consentUrl = new URL(authorization.headers.location as string);
    const consent = Object.fromEntries(consentUrl.searchParams);
    const page = await api()
      .get(consentUrl.pathname + consentUrl.search)
      .set("Host", "localhost:4000")
      .set("Cookie", owner.cookie)
      .expect(200);
    expect(page.text).toContain("Test connector");
    expect(page.headers["cache-control"]).toBe("no-store");
    await api()
      .post("/oauth/consent/decision")
      .type("form")
      .send({ ...consent, decision: "approve" })
      .expect(401);
    await api()
      .post("/oauth/consent/decision")
      .set("Cookie", owner.cookie)
      .type("form")
      .send({ ...consent, nonce: "wrong", decision: "approve" })
      .expect(400);
    const decision = await api()
      .post("/oauth/consent/decision")
      .set("Cookie", owner.cookie)
      .type("form")
      .send({ ...consent, decision: "approve" })
      .expect(303);
    const callback = new URL(decision.headers.location as string);
    expect(callback.searchParams.get("state")).toBe("test-state");
    const code = callback.searchParams.get("code");
    expect(code).toBeTruthy();
    const exchange = {
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    };
    await api()
      .post("/token")
      .type("form")
      .send({ ...exchange, code_verifier: "b".repeat(64) })
      .expect(400);
    const tokens = await api()
      .post("/token")
      .type("form")
      .send(exchange)
      .expect(200);
    expect(tokens.body.access_token).toBeTruthy();
    const stored = await prisma.oAuthToken.findMany({
      where: { userId: owner.userId }
    });
    expect(stored).toHaveLength(2);
    expect(JSON.stringify(stored)).not.toContain(tokens.body.access_token);
    expect(JSON.stringify(stored)).not.toContain(tokens.body.refresh_token);
    const grant = await prisma.client.findFirstOrThrow({
      where: { userId: owner.userId }
    });
    const policy = await prisma.policy.findFirstOrThrow({
      where: { clientId: grant.id }
    });
    expect(policy).toMatchObject({
      maxSensitivity: "INTERNAL",
      requiresConfirmation: false
    });
    await api()
      .get("/v1/memory-categories")
      .set("Authorization", `Bearer ${tokens.body.access_token}`)
      .expect(200);
    await api().post("/token").type("form").send(exchange).expect(400);
    expect(
      await prisma.oAuthToken.count({
        where: { userId: owner.userId, revokedAt: null }
      })
    ).toBe(0);
    await api()
      .get("/v1/memory-categories")
      .set("Authorization", `Bearer ${tokens.body.access_token}`)
      .expect(401);
  });
});
