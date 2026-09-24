import {
  AuditActorType,
  AuditEventType,
  ClientRetention,
  ClientTrustLevel,
  ClientType,
  MemorySensitivity,
  PolicyOperation
} from "@funes-vault/db";
import { voiceClientName, webChatClientName } from "@funes-vault/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  defaultVoiceMaxSensitivity,
  FirstPartyAccessService
} from "./first-party-access.service.js";

describe("privacy: FirstPartyAccessService", () => {
  it("creates the default Web Chat client and policy values", async () => {
    const tx = {
      client: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "client_1",
          name: webChatClientName,
          trustLevel: ClientTrustLevel.APPROVED
        })
      },
      memoryCategory: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "category_1" }, { id: "category_2" }])
      },
      policy: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "policy_1" })
      }
    };
    const prisma = {
      client: {
        $transaction: vi.fn(
          async (callback: (transaction: typeof tx) => unknown) => callback(tx)
        )
      }
    };
    const auditService = {
      createAuditEvent: vi.fn()
    };
    const service = await createService(FirstPartyAccessService, [
      { provide: PrismaService, useValue: prisma },
      { provide: AuditTrailService, useValue: auditService }
    ]);

    await expect(
      service.ensureWebChatAccess("user_1", {
        actorType: AuditActorType.USER,
        actorId: "user_1"
      })
    ).resolves.toEqual({
      clientId: "client_1",
      policyId: "policy_1"
    });
    expect(tx.client.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        name: webChatClientName,
        type: ClientType.WEB_APP,
        trustLevel: ClientTrustLevel.APPROVED,
        declaredRetention: ClientRetention.NO_STORAGE
      },
      select: { id: true, name: true, trustLevel: true }
    });
    expect(tx.policy.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        clientId: "client_1",
        maxSensitivity: MemorySensitivity.SECRET,
        operations: [
          PolicyOperation.READ,
          PolicyOperation.SUGGEST,
          PolicyOperation.WRITE
        ],
        requiresConfirmation: false,
        expiresAt: null,
        allowedCategories: {
          connect: [{ id: "category_1" }, { id: "category_2" }]
        }
      },
      select: { id: true }
    });
    expect(auditService.createAuditEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: "user_1",
        clientId: "client_1",
        type: AuditEventType.CLIENT_CREATED,
        actorType: AuditActorType.USER,
        actorId: "user_1"
      })
    );
    expect(auditService.createAuditEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: "user_1",
        clientId: "client_1",
        type: AuditEventType.POLICY_CREATED,
        actorType: AuditActorType.USER,
        actorId: "user_1"
      })
    );
  });

  it("keeps existing Web Chat client and policy edits intact", async () => {
    const tx = {
      client: {
        findFirst: vi.fn().mockResolvedValue({
          id: "client_1",
          name: webChatClientName,
          trustLevel: ClientTrustLevel.BLOCKED
        }),
        create: vi.fn()
      },
      memoryCategory: {
        findMany: vi.fn()
      },
      policy: {
        findFirst: vi.fn().mockResolvedValue({ id: "policy_1" }),
        create: vi.fn()
      }
    };
    const prisma = {
      client: {
        $transaction: vi.fn(
          async (callback: (transaction: typeof tx) => unknown) => callback(tx)
        )
      }
    };
    const auditService = {
      createAuditEvent: vi.fn()
    };
    const service = await createService(FirstPartyAccessService, [
      { provide: PrismaService, useValue: prisma },
      { provide: AuditTrailService, useValue: auditService }
    ]);

    await expect(service.ensureWebChatAccess("user_1")).resolves.toEqual({
      clientId: "client_1",
      policyId: "policy_1"
    });
    expect(tx.client.create).not.toHaveBeenCalled();
    expect(tx.memoryCategory.findMany).not.toHaveBeenCalled();
    expect(tx.policy.create).not.toHaveBeenCalled();
    expect(auditService.createAuditEvent).not.toHaveBeenCalled();
  });

  it("creates the voice client with a SENSITIVE ceiling and no direct writes", async () => {
    const tx = {
      client: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "voice_client",
          name: voiceClientName,
          trustLevel: ClientTrustLevel.APPROVED
        })
      },
      memoryCategory: {
        findMany: vi.fn().mockResolvedValue([{ id: "category_1" }])
      },
      policy: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "voice_policy" })
      }
    };
    const prisma = {
      client: {
        $transaction: vi.fn(
          async (callback: (transaction: typeof tx) => unknown) => callback(tx)
        )
      }
    };
    const auditService = {
      createAuditEvent: vi.fn()
    };
    const service = await createService(FirstPartyAccessService, [
      { provide: PrismaService, useValue: prisma },
      { provide: AuditTrailService, useValue: auditService }
    ]);

    await expect(service.ensureVoiceAccess("user_1")).resolves.toEqual({
      clientId: "voice_client",
      policyId: "voice_policy"
    });
    expect(tx.policy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        maxSensitivity: MemorySensitivity.SENSITIVE,
        operations: [PolicyOperation.READ, PolicyOperation.SUGGEST]
      }),
      select: { id: true }
    });
  });

  it("honors VOICE_MAX_SENSITIVITY for the voice ceiling default", () => {
    expect(defaultVoiceMaxSensitivity()).toBe(MemorySensitivity.SENSITIVE);

    vi.stubEnv("VOICE_MAX_SENSITIVITY", "INTERNAL");
    expect(defaultVoiceMaxSensitivity()).toBe(MemorySensitivity.INTERNAL);

    vi.stubEnv("VOICE_MAX_SENSITIVITY", "not-a-level");
    expect(defaultVoiceMaxSensitivity()).toBe(MemorySensitivity.SENSITIVE);
    vi.stubEnv("VOICE_MAX_SENSITIVITY", undefined);
  });
});

afterEach(() => vi.unstubAllEnvs());
