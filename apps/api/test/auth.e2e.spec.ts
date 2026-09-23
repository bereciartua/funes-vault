import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashSessionToken } from "../src/auth/session.js";
import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: Google-only auth (e2e)", () => {
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

  async function begin(path = "/auth/google", cookie?: string) {
    const req = request(app.getHttpServer()).get(path);
    if (cookie) {
      req.set("Cookie", cookie);
    }
    const response = await req.expect(302);

    return {
      state: new URL(response.headers.location!).searchParams.get("state")!,
      cookie: (response.headers["set-cookie"] as unknown as string[])[0]!.split(
        ";"
      )[0] as string
    };
  }
  function finish(
    flow: { state: string; cookie: string },
    email = "google@example.com",
    sessionCookie?: string
  ) {
    return request(app.getHttpServer())
      .get(
        `/auth/google/callback?${new URLSearchParams({ state: flow.state, code: `test-${email}` })}`
      )
      .set("Cookie", [flow.cookie, ...(sessionCookie ? [sessionCookie] : [])]);
  }

  it("creates the vault, reuses the identity, establishes a hashed session, and logs out", async () => {
    const flow = await begin();
    const stored = await prisma.loginAttempt.findFirstOrThrow();
    expect(stored.stateHash).toBe(hashSessionToken(flow.state));
    expect(stored.browserHash).not.toBe(flow.cookie.split("=")[1]);
    const response = await finish(flow).expect(303);
    expect(response.headers.location).toBe("http://localhost:3000/vault");
    const cookie = (response.headers["set-cookie"] as unknown as string[]).find(
      (c) => c.startsWith("funes_vault_session=")
    )!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookie)
      .expect(200);
    expect(me.body.user.email).toBe("google@example.com");
    expect(Object.keys(me.body.user).sort()).toEqual([
      "displayName",
      "email",
      "id",
      "role"
    ]);
    expect(
      await prisma.policy.count({ where: { userId: me.body.user.id } })
    ).toBeGreaterThan(0);
    expect(await prisma.loginAttempt.count()).toBe(0);
    await finish(await begin()).expect(303);
    expect(await prisma.user.count()).toBe(1);
    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Cookie", cookie)
      .expect(201);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookie)
      .expect(401);
  });

  it("rejects missing browser binding, expired attempts, callback replay and provider cancellation", async () => {
    const flow = await begin();
    const missing = await request(app.getHttpServer())
      .get(
        `/auth/google/callback?state=${flow.state}&code=test-google@example.com`
      )
      .expect(303);
    expect(missing.headers.location).toContain("authError");
    await prisma.loginAttempt.updateMany({ data: { expiresAt: new Date(0) } });
    expect((await finish(flow)).headers.location).toContain("authError");
    const valid = await begin();
    await finish(valid).expect(303);
    expect((await finish(valid)).headers.location).toContain("authError");
    const canceled = await begin();
    const response = await request(app.getHttpServer())
      .get(`/auth/google/callback?state=${canceled.state}&error=access_denied`)
      .set("Cookie", canceled.cookie)
      .expect(303);
    expect(response.headers.location).toContain("authError");
    expect(await prisma.loginAttempt.count()).toBe(0);
  });

  it("rejects foreign return URLs and returns MCP sign-ins to their consent request", async () => {
    for (const returnTo of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/vault?next=https://evil.example",
      "/auth/google"
    ]) {
      await request(app.getHttpServer())
        .get("/auth/google")
        .query({ returnTo })
        .expect(400);
    }
    const returnTo = "/oauth/consent?request=request1&nonce=nonce1";
    const response = await finish(
      await begin(`/auth/google?returnTo=${encodeURIComponent(returnTo)}`)
    ).expect(303);
    expect(response.headers.location).toBe(`http://localhost:4000${returnTo}`);
  });

  it("never links an existing vault by email and keys repeat sign-in by Google subject", async () => {
    await prisma.user.create({ data: { email: "google@example.com" } });
    expect((await finish(await begin())).headers.location).toContain(
      "authError"
    );
    expect(await prisma.googleIdentity.count()).toBe(0);
  });

  it("requires verification of the same identity and session before explicit account deletion", async () => {
    const user = await createUserWithSession(prisma, "delete@example.com");
    const other = await createUserWithSession(prisma, "other@example.com");
    const del = () =>
      request(app.getHttpServer())
        .delete("/auth/me")
        .set("Cookie", user.cookie)
        .send({ confirmation: "DELETE" });
    await del().expect(403);
    const wrong = await finish(
      await begin("/auth/google/verify-deletion", user.cookie),
      other.email,
      user.cookie
    );
    expect(wrong.headers.location).toContain("authError");
    await del().expect(403);
    const switched = await finish(
      await begin("/auth/google/verify-deletion", user.cookie),
      user.email,
      other.cookie
    );
    expect(switched.headers.location).toContain("authError");
    const verified = await finish(
      await begin("/auth/google/verify-deletion", user.cookie),
      user.email,
      user.cookie
    ).expect(303);
    expect(verified.headers.location).toContain("/settings/data?verified=1");
    expect(await prisma.user.count()).toBe(2);
    await request(app.getHttpServer())
      .delete("/auth/me")
      .set("Cookie", user.cookie)
      .send({ confirmation: "wrong" })
      .expect(400);
    await del().expect(200);
    expect(
      await prisma.user.findUnique({ where: { id: user.userId } })
    ).toBeNull();
    expect(
      await prisma.user.findUnique({ where: { id: other.userId } })
    ).not.toBeNull();
    expect(await prisma.googleIdentity.count()).toBe(1);
  });

  it("rejects expired deletion verification and expired sessions", async () => {
    const user = await createUserWithSession(prisma, "expired@example.com");
    await prisma.session.update({
      where: { id: user.sessionId },
      data: { deletionVerifiedAt: new Date(Date.now() - 6 * 60_000) }
    });
    await request(app.getHttpServer())
      .delete("/auth/me")
      .set("Cookie", user.cookie)
      .send({ confirmation: "DELETE" })
      .expect(403);
    await prisma.session.update({
      where: { id: user.sessionId },
      data: { expiresAt: new Date(0) }
    });
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", user.cookie)
      .expect(401);
  });

  it("consumes concurrent callbacks only once", async () => {
    const flow = await begin();
    const responses = await Promise.all([finish(flow), finish(flow)]);
    expect(
      responses.filter((r) => r.headers.location?.endsWith("/vault"))
    ).toHaveLength(1);
    expect(
      responses.filter((r) => r.headers.location?.includes("authError"))
    ).toHaveLength(1);
    expect(await prisma.session.count()).toBe(1);
  });

  it("preserves the complete MCP consent flow across connector and API origins", async () => {
    const server = app.getHttpServer();
    const registered = await request(server)
      .post("/register")
      .send({
        client_name: "Google login integration test",
        redirect_uris: ["http://localhost:8080/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none"
      })
      .expect(201);
    const authorized = await request(server)
      .get("/authorize")
      .query({
        client_id: registered.body.client_id,
        response_type: "code",
        redirect_uri: "http://localhost:8080/callback",
        code_challenge: "a".repeat(43),
        code_challenge_method: "S256",
        scope: "memory.read",
        state: "mcp-client-state"
      })
      .expect(302);
    const consent = new URL(authorized.headers.location!);
    const path = consent.pathname + consent.search;
    const canonical = await request(server)
      .get(path)
      .set("Host", "connector.example.com")
      .expect(303);
    expect(canonical.headers.location).toBe(`http://localhost:4000${path}`);
    const anonymous = await request(server)
      .get(path)
      .set("Host", "localhost:4000")
      .expect(200);
    expect(anonymous.text).toContain("Continue with Google");
    expect(anonymous.text).not.toContain('type="password"');
    const loggedIn = await finish(
      await begin(`/auth/google?returnTo=${encodeURIComponent(path)}`)
    );
    expect(loggedIn.headers.location).toBe(`http://localhost:4000${path}`);
    const cookie = (loggedIn.headers["set-cookie"] as unknown as string[]).find(
      (c) => c.startsWith("funes_vault_session=")
    )!;
    const preview = await request(server)
      .get(path)
      .set("Host", "localhost:4000")
      .set("Cookie", cookie)
      .expect(200);
    expect(preview.text).toContain("Google login integration test");
    const decision = await request(server)
      .post("/oauth/consent/decision")
      .set("Host", "localhost:4000")
      .set("Cookie", cookie)
      .type("form")
      .send({
        request: consent.searchParams.get("request"),
        nonce: consent.searchParams.get("nonce"),
        decision: "approve"
      })
      .expect(303);
    const clientRedirect = new URL(decision.headers.location!);
    expect(clientRedirect.origin).toBe("http://localhost:8080");
    expect(clientRedirect.searchParams.get("state")).toBe("mcp-client-state");
    expect(clientRedirect.searchParams.get("code")).toBeTruthy();
  });

  it("provisions one vault for simultaneous first sign-ins and preserves the stable identity", async () => {
    const first = await begin();
    const second = await begin();
    const results = await Promise.all([
      finish(first, "concurrent@example.com"),
      finish(second, "concurrent@example.com")
    ]);
    expect(results.map((r) => r.headers.location)).toEqual([
      "http://localhost:3000/vault",
      "http://localhost:3000/vault"
    ]);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.googleIdentity.count()).toBe(1);
    expect(await prisma.session.count()).toBe(2);
    const { AuthService } = await import("../src/auth/auth.service.js");
    const response = await app.get(AuthService).signInWithGoogle({
      subject: "test-concurrent@example.com",
      email: "changed@example.com",
      displayName: "Changed"
    });
    expect(response.user.id).toBe((await prisma.user.findFirstOrThrow()).id);
    expect(await prisma.user.count()).toBe(1);
  });

  it("rate limits Google authorization starts", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt++) {
      const response = await request(app.getHttpServer())
        .get("/auth/google")
        .set("X-Forwarded-For", "192.0.2.17");
      statuses.push(response.status);
    }
    expect(statuses[0]).toBe(302);
    expect(statuses[20]).toBe(429);
  });

  it("removes all password login endpoints", async () => {
    for (const path of [
      "/auth/login",
      "/auth/register",
      "/oauth/consent/login"
    ]) {
      await request(app.getHttpServer())
        .post(path)
        .send({ email: "demo@funes-vault.local", password: "password" })
        .expect(404);
    }
    await request(app.getHttpServer())
      .patch("/auth/password")
      .send({})
      .expect(404);
  });
});
