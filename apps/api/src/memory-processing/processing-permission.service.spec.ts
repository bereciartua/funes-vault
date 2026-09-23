import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProcessingPermissionService } from "./processing-permission.service.js";

describe("privacy: processing permission", () => {
  async function setup(
    consent: { version: number; revokedAt: Date | null } | null
  ) {
    const findUnique = vi.fn().mockResolvedValue(consent);
    const service = await createService(ProcessingPermissionService, [
      {
        provide: PrismaService,
        useValue: { client: { processingConsent: { findUnique } } }
      },
      { provide: AuditTrailService, useValue: {} }
    ]);

    return { service, findUnique };
  }
  it.each([
    null,
    { version: 0, revokedAt: null },
    { version: 1, revokedAt: new Date() }
  ])("blocks absent, obsolete, and revoked consent", async (consent) => {
    const { service } = await setup(consent);
    await expect(
      service.check("owner", "extraction", ["typesafe"], {
        text: "A preference"
      })
    ).rejects.toMatchObject({ reason: "processing_consent_required" });
  });
  it("looks up consent for the exact owner, processor, and task", async () => {
    const { service, findUnique } = await setup({
      version: 1,
      revokedAt: null
    });
    await expect(
      service.check("owner", "consolidation", ["typesafe"])
    ).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        userId_processor_scope: {
          userId: "owner",
          processor: "typesafe",
          scope: "consolidation"
        }
      }
    });
  });
  it("blocks secret-like payloads before any external processor even with valid consent", async () => {
    const { service, findUnique } = await setup({
      version: 1,
      revokedAt: null
    });
    await expect(
      service.check("owner", "extraction", ["openai"], {
        text: "password=synthetic-secret-value"
      })
    ).rejects.toMatchObject({ reason: "secret_like_content" });
    expect(findUnique).not.toHaveBeenCalled();
  });
  it("does not require classifier consent for the standard processor", async () => {
    const { service, findUnique } = await setup(null);
    await expect(
      service.check("owner", "extraction", ["openai"], { text: "A preference" })
    ).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
