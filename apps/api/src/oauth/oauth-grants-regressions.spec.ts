import { ConflictException } from "@nestjs/common";
import { expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { hashOAuthCredential } from "./oauth-credentials.js";
import { OAuthGrantsService } from "./oauth-grants.service.js";
async function setup() {
  const db = {
    oAuthAuthorizationRequest: {
      findUnique: vi.fn().mockResolvedValue({
        id: "request",
        registrationId: "registration",
        redirectUri: "https://app.example/callback",
        scopes: ["memory.read"],
        expiresAt: new Date(Date.now() + 60000),
        csrfTokenHash: hashOAuthCredential("nonce"),
        registration: { name: "App", status: "APPROVED" }
      })
    },
    client: { findFirst: vi.fn().mockResolvedValue(null) },
    memoryCategory: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ key: "preferences" }, { key: "new_category" }])
    },
    $transaction: vi.fn().mockRejectedValue({ code: "P2002" })
  };
  const service = await createService(OAuthGrantsService, [
    { provide: PrismaService, useValue: { client: db } },
    { provide: AuditTrailService, useValue: { createAuditEvent: vi.fn() } }
  ]);

  return { service, db };
}
it("does not load categories for anonymous consent and includes current categories for first connect", async () => {
  const { service, db } = await setup();
  expect(
    (await service.getConsentContext("request")).allowedCategories
  ).toEqual([]);
  expect(db.memoryCategory.findMany).not.toHaveBeenCalled();
  expect(
    (await service.getConsentContext("request", "owner")).allowedCategories
  ).toEqual(["preferences", "new_category"]);
});
it("turns concurrent grant creation into an actionable conflict", async () => {
  const { service } = await setup();
  await expect(
    service.approve({ userId: "owner", requestId: "request", nonce: "nonce" })
  ).rejects.toThrow(ConflictException);
});
