import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { renderConsentPage } from "../src/oauth/oauth-consent.html.js";
import { hashOAuthCredential } from "../src/oauth/oauth-credentials.js";
import { OAuthGrantsService } from "../src/oauth/oauth-grants.service.js";
import { OAuthTokensService } from "../src/oauth/oauth-tokens.service.js";
import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: OAuth app permission boundaries", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createE2ePrismaClient>;
  let userId: string;
  let clientId: string;
  let registrationId: string;
  let policyId: string;
  const api = () => request(app.getHttpServer());
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
    userId = (
      await createUserWithSession(prisma, "oauth-permissions@example.test")
    ).userId;
    const registration = await prisma.oAuthClientRegistration.create({
      data: {
        clientId: "registered-test",
        name: "Registered app",
        redirectUris: ["http://localhost:8765/callback"],
        grantTypes: ["authorization_code", "refresh_token"],
        status: "APPROVED"
      }
    });
    registrationId = registration.id;
    const client = await prisma.client.create({
      data: {
        userId,
        name: "Registered app",
        type: "MCP_CLIENT",
        trustLevel: "APPROVED",
        oauthRegistrationId: registrationId
      }
    });
    clientId = client.id;
    const policy = await prisma.policy.create({
      data: {
        userId,
        clientId,
        operations: ["SUGGEST"],
        maxSensitivity: "LOW",
        requiresConfirmation: false
      }
    });
    policyId = policy.id;
  });
  const tokenPair = (scopes: string[]) =>
    app.get(OAuthTokensService).issueTokenPair({
      userId,
      clientId,
      registrationId,
      scopes,
      resource: null,
      sourceCodeId: null,
      grantType: "authorization_code"
    });
  const consentRequest = () =>
    prisma.oAuthAuthorizationRequest.create({
      data: {
        registrationId,
        redirectUri: "http://localhost:8765/callback",
        codeChallenge: "synthetic-challenge",
        scopes: ["memory.read", "memory.suggest"],
        csrfTokenHash: hashOAuthCredential("nonce"),
        expiresAt: new Date(Date.now() + 60000)
      }
    });

  it("keeps token scopes as route ceilings and uses policy alone for WRITE", async () => {
    const readOnly = await tokenPair(["memory.read"]);
    await api()
      .post("/v1/memory-suggestions")
      .set("Authorization", `Bearer ${readOnly.accessToken}`)
      .send({ title: "Color", body: "Blue" })
      .expect(403);
    await api()
      .post("/v1/captures")
      .set("Authorization", `Bearer ${readOnly.accessToken}`)
      .send({ text: "Color is blue" })
      .expect(403);
    const suggestOnly = await tokenPair(["memory.suggest"]);
    await api()
      .post("/v1/memory-requests")
      .set("Authorization", `Bearer ${suggestOnly.accessToken}`)
      .send({ task: "color" })
      .expect(403);
    const propose = () =>
      api()
        .post("/v1/memory-suggestions")
        .set("Authorization", `Bearer ${suggestOnly.accessToken}`)
        .send({ title: "Color", body: "Blue", purpose: "Any reason" });
    expect((await propose()).body.status).toBe("QUEUED_FOR_REVIEW");
    await prisma.policy.update({
      where: { id: policyId },
      data: { operations: ["SUGGEST", "WRITE"] }
    });
    expect((await propose()).body.status).toBe("APPLIED");
  });

  it("shows resulting re-consent permissions and preserves owner-set limits", async () => {
    await prisma.memoryCategory.create({
      data: { key: "color", name: "Color" }
    });
    const expiresAt = new Date(Date.now() + 86400000);
    await prisma.policy.update({
      where: { id: policyId },
      data: {
        requiresConfirmation: true,
        expiresAt,
        allowedCategories: { connect: { key: "color" } },
        deniedCategories: { connect: { key: "color" } }
      }
    });
    const pending = await consentRequest();
    const grants = app.get(OAuthGrantsService);
    const context = await grants.getConsentContext(pending.id, userId);
    expect(context).toMatchObject({
      createsPermissions: false,
      maxSensitivity: "LOW",
      operations: ["SUGGEST", "READ"],
      requiresConfirmation: true,
      allowedCategories: ["color"],
      deniedCategories: ["color"],
      expiresAt: expiresAt.toISOString()
    });
    expect(
      renderConsentPage({
        context,
        nonce: "nonce",
        userEmail: "oauth-permissions@example.test"
      })
    ).toContain("App permissions after approval");
    await grants.approve({ userId, requestId: pending.id, nonce: "nonce" });
    expect(
      await prisma.policy.findUniqueOrThrow({
        where: { id: policyId },
        include: { allowedCategories: true, deniedCategories: true }
      })
    ).toMatchObject({
      requiresConfirmation: true,
      expiresAt,
      maxSensitivity: "LOW",
      operations: ["SUGGEST", "READ"],
      allowedCategories: [{ key: "color" }],
      deniedCategories: [{ key: "color" }]
    });
  });

  it("refresh never restores removed permissions; explicit re-consent does", async () => {
    const tokens = await tokenPair(["memory.read", "memory.suggest"]);
    await prisma.policy.delete({ where: { id: policyId } });
    await api()
      .post("/token")
      .type("form")
      .send({
        grant_type: "refresh_token",
        client_id: "registered-test",
        refresh_token: tokens.refreshToken
      })
      .expect(200);
    expect(await prisma.policy.count({ where: { clientId } })).toBe(0);
    const pending = await consentRequest();
    const grants = app.get(OAuthGrantsService);
    expect(
      (await grants.getConsentContext(pending.id, userId)).createsPermissions
    ).toBe(true);
    await grants.approve({ userId, requestId: pending.id, nonce: "nonce" });
    expect(
      await prisma.policy.findFirstOrThrow({ where: { clientId } })
    ).toMatchObject({ operations: ["READ", "SUGGEST"] });
  });

  it("never unblocks an app at consent", async () => {
    await prisma.client.update({
      where: { id: clientId },
      data: { trustLevel: "BLOCKED" }
    });
    const pending = await consentRequest();
    const grants = app.get(OAuthGrantsService);
    await expect(grants.getConsentContext(pending.id, userId)).rejects.toThrow(
      "Apps & access"
    );
    await expect(
      grants.approve({ userId, requestId: pending.id, nonce: "nonce" })
    ).rejects.toThrow("Apps & access");
    expect(
      (await prisma.client.findUniqueOrThrow({ where: { id: clientId } }))
        .trustLevel
    ).toBe("BLOCKED");
  });
});
