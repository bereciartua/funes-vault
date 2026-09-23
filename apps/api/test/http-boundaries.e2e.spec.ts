import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createE2eApp } from "./e2e-harness.js";

describe("HTTP security boundaries", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createE2eApp();
  });
  afterAll(async () => {
    await app.close();
  });
  it("limits normal JSON to 100 KB while accepting larger import envelopes before authentication", async () => {
    const payload = { text: "a".repeat(110_000) };
    await request(app.getHttpServer())
      .post("/v1/captures")
      .send(payload)
      .expect(413);
    for (const path of ["/v1/data/import", "/v1/data/import/preview"]) {
      await request(app.getHttpServer()).post(path).send(payload).expect(401);
      await request(app.getHttpServer())
        .post(path)
        .send({ text: "a".repeat(10 * 1024 * 1024) })
        .expect(413);
    }
  });
  it("permits inline Swagger scripts only on the docs route", async () => {
    const health = await request(app.getHttpServer())
      .get("/health")
      .expect(200);
    const docs = await request(app.getHttpServer()).get("/docs").expect(200);
    expect(health.headers["content-security-policy"]).toContain(
      "script-src 'self';"
    );
    expect(docs.headers["content-security-policy"]).toContain(
      "https://validator.swagger.io"
    );
    expect(docs.headers["content-security-policy"]).not.toContain(
      "upgrade-insecure-requests"
    );
    expect(docs.headers["content-security-policy"]).toContain(
      "script-src 'self' 'unsafe-inline'"
    );
  });
});
