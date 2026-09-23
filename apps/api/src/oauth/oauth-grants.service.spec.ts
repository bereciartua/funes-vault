import {
  ClientTrustLevel,
  MemorySensitivity,
  OAuthRegistrationStatus,
  PolicyOperation
} from "@funes-vault/db";
import { describe, expect, it, vi } from "vitest";

import { createService as resolveService } from "../../test/mocks/create-service.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { mcpConnectorPurpose } from "./oauth.config.js";
import { hashOAuthCredential } from "./oauth-credentials.js";
import {
  defaultConnectorMaxSensitivity,
  OAuthGrantsService,
  scopesToOperations
} from "./oauth-grants.service.js";

const future = new Date(Date.now() + 60_000);

function createRegistration(overrides: Record<string, unknown> = {}) {
  return {
    id: "registration_1",
    clientId: "oauth_client_1",
    name: "Claude",
    status: OAuthRegistrationStatus.PENDING,
    clientUri: null,
    logoUri: null,
    ...overrides
  };
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "request_1",
    registrationId: "registration_1",
    redirectUri: "https://claude.ai/api/mcp/auth_callback",
    codeChallenge: "challenge",
    scopes: ["memory.read", "memory.suggest"],
    state: "abc123",
    resource: null,
    csrfTokenHash: hashOAuthCredential("nonce-1"),
    expiresAt: future,
    decidedAt: null,
    registration: createRegistration(),
    ...overrides
  };
}

function createTx() {
  return {
    client: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "client_1",
        name: "Claude",
        trustLevel: ClientTrustLevel.APPROVED
      }),
      update: vi.fn()
    },
    memoryCategory: {
      findMany: vi.fn().mockResolvedValue([{ id: "category_1" }])
    },
    policy: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "policy_1" }),
      update: vi.fn()
    },
    oAuthClientRegistration: {
      update: vi.fn()
    },
    oAuthAuthorizationCode: {
      create: vi.fn()
    },
    oAuthAuthorizationRequest: {
      update: vi.fn()
    }
  };
}

async function createService(request: ReturnType<typeof createRequest> | null) {
  const tx = createTx();
  const prisma = {
    client: {
      oAuthAuthorizationRequest: {
        findUnique: vi.fn().mockResolvedValue(request)
      },
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => unknown) => callback(tx)
      )
    }
  };
  const auditService = { createAuditEvent: vi.fn() };
  const service = await resolveService(OAuthGrantsService, [
    { provide: PrismaService, useValue: prisma },
    { provide: AuditTrailService, useValue: auditService }
  ]);

  return { service, tx, prisma, auditService };
}

describe("privacy: scopesToOperations", () => {
  it("maps scopes onto policy operations", () => {
    expect(scopesToOperations(["memory.read", "memory.suggest"])).toEqual([
      PolicyOperation.READ,
      PolicyOperation.SUGGEST
    ]);
    expect(scopesToOperations(["memory.read"])).toEqual([PolicyOperation.READ]);
    expect(scopesToOperations([])).toEqual([]);
  });
});

describe("privacy: OAuthGrantsService.approve", () => {
  it("creates the grant client, policy, and single-use code on approval", async () => {
    const { service, tx, auditService } = await createService(createRequest());

    const result = await service.approve({
      userId: "user_1",
      requestId: "request_1",
      nonce: "nonce-1"
    });

    expect(tx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          trustLevel: ClientTrustLevel.APPROVED,
          oauthRegistrationId: "registration_1"
        })
      })
    );
    expect(tx.policy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purpose: mcpConnectorPurpose,
          operations: [PolicyOperation.READ, PolicyOperation.SUGGEST],
          maxSensitivity: MemorySensitivity.INTERNAL
        })
      })
    );
    expect(tx.oAuthClientRegistration.update).toHaveBeenCalledWith({
      where: { id: "registration_1" },
      data: { status: OAuthRegistrationStatus.APPROVED }
    });

    const codeData = tx.oAuthAuthorizationCode.create.mock.calls[0]?.[0].data;
    expect(codeData.codeHash).not.toContain("fvac_");
    expect(codeData.userId).toBe("user_1");
    expect(codeData.codeChallenge).toBe("challenge");

    const redirect = new URL(result.redirectUrl);
    expect(redirect.origin + redirect.pathname).toBe(
      "https://claude.ai/api/mcp/auth_callback"
    );
    expect(redirect.searchParams.get("code")).toMatch(/^fvac_/);
    expect(redirect.searchParams.get("state")).toBe("abc123");
    expect(hashOAuthCredential(redirect.searchParams.get("code") ?? "")).toBe(
      codeData.codeHash
    );

    expect(auditService.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "OAUTH_GRANT_APPROVED" })
    );
  });

  it("only widens the connector policy operations on re-approval", async () => {
    const request = createRequest({
      registration: createRegistration({
        status: OAuthRegistrationStatus.APPROVED
      })
    });
    const { service, tx } = await createService(request);
    tx.client.findFirst.mockResolvedValue({
      id: "client_1",
      trustLevel: ClientTrustLevel.APPROVED
    });
    tx.policy.findFirst.mockResolvedValue({
      id: "policy_1",
      operations: [PolicyOperation.READ, PolicyOperation.SUGGEST]
    });

    await service.approve({
      userId: "user_1",
      requestId: "request_1",
      nonce: "nonce-1"
    });

    expect(tx.client.create).not.toHaveBeenCalled();
    expect(tx.policy.create).not.toHaveBeenCalled();
    expect(tx.policy.update).not.toHaveBeenCalled();
    expect(tx.oAuthClientRegistration.update).not.toHaveBeenCalled();
  });

  it("rejects a consent decision with the wrong nonce", async () => {
    const { service, tx } = await createService(createRequest());

    await expect(
      service.approve({
        userId: "user_1",
        requestId: "request_1",
        nonce: "wrong"
      })
    ).rejects.toThrow("Invalid consent nonce");
    expect(tx.oAuthAuthorizationCode.create).not.toHaveBeenCalled();
  });

  it("rejects expired and already-decided requests", async () => {
    const expired = await createService(
      createRequest({ expiresAt: new Date(Date.now() - 1000) })
    );
    await expect(
      expired.service.approve({
        userId: "user_1",
        requestId: "request_1",
        nonce: "nonce-1"
      })
    ).rejects.toThrow("expired");

    const decided = await createService(
      createRequest({ decidedAt: new Date() })
    );
    await expect(
      decided.service.approve({
        userId: "user_1",
        requestId: "request_1",
        nonce: "nonce-1"
      })
    ).rejects.toThrow("already decided");
  });

  it("hides requests from blocked registrations", async () => {
    const { service } = await createService(
      createRequest({
        registration: createRegistration({
          status: OAuthRegistrationStatus.BLOCKED
        })
      })
    );

    await expect(
      service.approve({
        userId: "user_1",
        requestId: "request_1",
        nonce: "nonce-1"
      })
    ).rejects.toThrow("not found");
  });
});

describe("privacy: OAuthGrantsService.deny", () => {
  it("redirects with access_denied and audits the denial", async () => {
    const { service, tx, auditService } = await createService(createRequest());

    const result = await service.deny({
      userId: "user_1",
      requestId: "request_1",
      nonce: "nonce-1"
    });

    const redirect = new URL(result.redirectUrl);
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    expect(redirect.searchParams.get("state")).toBe("abc123");
    expect(tx.oAuthAuthorizationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "request_1" } })
    );
    expect(auditService.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "OAUTH_GRANT_DENIED" })
    );
  });
});

describe("privacy: defaultConnectorMaxSensitivity", () => {
  it("defaults to INTERNAL", () => {
    expect(defaultConnectorMaxSensitivity()).toBe(MemorySensitivity.INTERNAL);
  });
});
