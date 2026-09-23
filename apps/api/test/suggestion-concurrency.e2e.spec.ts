import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createE2eApp,
  createE2ePrismaClient,
  createUserWithSession,
  resetTestDatabase
} from "./e2e-harness.js";

describe("privacy: suggestion review concurrency", () => {
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
  beforeEach(async () => resetTestDatabase(prisma));
  it.each(["apply", "reject"])(
    "claims once when apply races with %s",
    async (action) => {
      const owner = await createUserWithSession(prisma, "review@example.test");
      const suggestion = await prisma.memorySuggestion.create({
        data: {
          userId: owner.userId,
          title: "Concise answers",
          body: "I prefer concise answers.",
          suggestedKind: "PREFERENCE",
          sourceType: "MANUAL"
        }
      });
      const call = (verb: string) =>
        request(app.getHttpServer())
          .patch(`/v1/memory-suggestions/${suggestion.id}/${verb}`)
          .set("Cookie", owner.cookie)
          .send({});
      const responses = await Promise.all([call("apply"), call(action)]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409
      ]);
      const final = await prisma.memorySuggestion.findUniqueOrThrow({
        where: { id: suggestion.id }
      });
      const applied = final.status === "APPLIED";
      expect(
        await prisma.memory.count({ where: { userId: owner.userId } })
      ).toBe(applied ? 1 : 0);
      expect(
        await prisma.auditEvent.count({
          where: {
            userId: owner.userId,
            type: {
              in: ["MEMORY_SUGGESTION_APPROVED", "MEMORY_SUGGESTION_REJECTED"]
            }
          }
        })
      ).toBe(1);
    }
  );
  it.each([
    ["expired", "EXPIRED"],
    ["exact_duplicate", "ARCHIVED"]
  ])(
    "applies %s proposals with the correct lifecycle state",
    async (reason, status) => {
      const owner = await createUserWithSession(prisma, "expiry@example.test");
      const memory = await prisma.memory.create({
        data: {
          userId: owner.userId,
          kind: "FACT",
          title: "Temporary plan",
          body: "Synthetic context",
          expiresAt: new Date("2020-01-01")
        }
      });
      const suggestion = await prisma.memorySuggestion.create({
        data: {
          userId: owner.userId,
          title: "Review temporary plan",
          body: "Apply the proposed lifecycle change",
          suggestedKind: "FACT",
          sourceType: "CONSOLIDATION",
          sourceMetadata: {
            action: "archive_memory",
            reason,
            targetMemoryId: memory.id,
            targetVersion: memory.updatedAt.toISOString()
          }
        }
      });
      await request(app.getHttpServer())
        .patch(`/v1/memory-suggestions/${suggestion.id}/apply`)
        .set("Cookie", owner.cookie)
        .expect(200);
      expect(
        await prisma.memory.findUniqueOrThrow({ where: { id: memory.id } })
      ).toMatchObject({ status });
      expect(
        await prisma.auditEvent.count({
          where: {
            userId: owner.userId,
            type: "MEMORY_ARCHIVED",
            metadata: { path: ["reason"], equals: reason }
          }
        })
      ).toBe(1);
    }
  );
});
