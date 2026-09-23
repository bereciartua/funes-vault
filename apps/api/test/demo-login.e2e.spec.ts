import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { hashSessionToken } from "../src/auth/session.js";
import {
  createE2eApp,
  createE2ePrismaClient,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: development demo login", () => {
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
  afterEach(() => vi.unstubAllEnvs());

  it.each(["production", "test", "staging", undefined])(
    "rejects demo access with NODE_ENV=%s",
    async (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      await request(app.getHttpServer())
        .get("/auth/options")
        .expect(200, { demoLoginEnabled: false });
      await request(app.getHttpServer()).post("/auth/demo").expect(404);
      expect(await prisma.session.count()).toBe(0);
    }
  );

  it("opens only the seeded account without provider credentials and stores a hashed session", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Internet disabled"));
    try {
      const demo = await prisma.user.create({
        data: { email: "demo@funes-vault.local", displayName: "Demo User" }
      });
      await prisma.user.create({ data: { email: "other@example.com" } });
      await request(app.getHttpServer())
        .get("/auth/options")
        .expect(200, { demoLoginEnabled: true });
      const response = await request(app.getHttpServer())
        .post("/auth/demo")
        .send({ email: "other@example.com" })
        .expect(201);
      expect(Object.keys(response.body)).toEqual(["user"]);
      expect(response.body.user.id).toBe(demo.id);
      const cookie = (
        response.headers["set-cookie"] as unknown as string[]
      )[0]!;
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      const token = cookie.split(";")[0]!.split("=")[1]!;
      expect((await prisma.session.findFirstOrThrow()).tokenHash).toBe(
        hashSessionToken(token)
      );
      await request(app.getHttpServer())
        .get("/auth/me")
        .set("Cookie", cookie)
        .expect(200, response.body);
      expect(await prisma.googleIdentity.count()).toBe(0);
      expect(
        await prisma.policy.count({ where: { userId: demo.id } })
      ).toBeGreaterThan(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      await request(app.getHttpServer())
        .post("/auth/logout")
        .set("Cookie", cookie)
        .expect(201);
      await request(app.getHttpServer())
        .get("/auth/me")
        .set("Cookie", cookie)
        .expect(401);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("reports a missing seed rather than creating an empty vault", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await request(app.getHttpServer())
      .post("/auth/demo")
      .expect(404);
    expect(response.body.message).toContain("pnpm db:seed");
    expect(await prisma.user.count()).toBe(0);
  });

  it("does not bypass a linked identity or elevated account", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const demo = await prisma.user.create({
      data: { email: "demo@funes-vault.local", role: "ADMIN" }
    });
    await request(app.getHttpServer()).post("/auth/demo").expect(403);
    await prisma.user.update({
      where: { id: demo.id },
      data: { role: "USER", googleIdentity: { create: { subject: "subject" } } }
    });
    await request(app.getHttpServer()).post("/auth/demo").expect(403);
    expect(await prisma.session.count()).toBe(0);
  });
});
