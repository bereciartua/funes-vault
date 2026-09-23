import { AuditEventType } from "@funes-vault/db";
import { auditEventTypeSchema } from "@funes-vault/shared";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createE2eApp } from "./e2e-harness.js";

describe("platform surfaces (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp({
      redis: true,
      bullBoard: Boolean(process.env.E2E_REDIS_URL)
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("keeps database audit events readable by web and export consumers", () => {
    for (const type of Object.values(AuditEventType)) {
      expect(auditEventTypeSchema.parse(type)).toBe(type);
    }
  });

  it("serves liveness health", async () => {
    const response = await request(app.getHttpServer())
      .get("/health")
      .expect(200);
    expect(response.body.status).toBe("ok");
  });

  it.skipIf(!process.env.E2E_REDIS_URL)(
    "waits for configured queues before reporting readiness",
    async () => {
      const response = await request(app.getHttpServer())
        .get("/health/ready")
        .expect(200);
      expect(response.body.status).toBe("ok");
    }
  );

  it("serves the OpenAPI document", async () => {
    const response = await request(app.getHttpServer())
      .get("/openapi.json")
      .expect(200);
    expect(response.body.info.title).toBe("Funes Vault API");
    expect(response.body.paths["/auth/login"]).toBeUndefined();
    expect(response.body.paths["/auth/register"]).toBeUndefined();
    expect(response.body.paths["/auth/password"]).toBeUndefined();
    expect(response.body.paths["/auth/google/callback"]).toBeDefined();
    expect(response.body.paths["/auth/google/verify-deletion"]).toBeDefined();
    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining(["/v1/memories", "/auth/google"])
    );
  });

  it("serves OAuth discovery metadata for MCP connectors", async () => {
    const authServer = await request(app.getHttpServer())
      .get("/.well-known/oauth-authorization-server")
      .expect(200);
    expect(authServer.body.issuer).toBeDefined();
    expect(authServer.body.token_endpoint).toBeDefined();

    const resource = await request(app.getHttpServer())
      .get("/.well-known/oauth-protected-resource")
      .expect(200);
    expect(resource.body.resource).toBeDefined();
    expect(resource.body.authorization_servers).toBeDefined();
  });

  it("returns the standard error envelope with a request id for unknown routes", async () => {
    const response = await request(app.getHttpServer())
      .get("/definitely-not-a-route")
      .set("X-Request-Id", "e2e-req-1")
      .expect(404);
    expect(response.body.statusCode).toBe(404);
    expect(response.body.requestId).toBe("e2e-req-1");
    expect(response.headers["x-request-id"]).toBe("e2e-req-1");
  });

  it.skipIf(!process.env.E2E_REDIS_URL)(
    "rejects unauthenticated queue dashboard access",
    async () => {
      await request(app.getHttpServer()).get("/admin/queues").expect(401);
    }
  );
});
