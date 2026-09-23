import {
  ClientTrustLevel,
  OAuthRegistrationStatus,
  OAuthTokenType
} from "@funes-vault/db";
import { describe, expect, it, vi } from "vitest";

import { createService as resolveService } from "../../test/mocks/create-service.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { hashOAuthCredential } from "./oauth-credentials.js";
import { OAuthTokensService } from "./oauth-tokens.service.js";

const future = new Date(Date.now() + 60_000);

function createTokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "token_1",
    registrationId: "registration_1",
    userId: "user_1",
    clientId: "client_1",
    type: OAuthTokenType.ACCESS,
    tokenHash: hashOAuthCredential("fvoa_token"),
    scopes: ["memory.read"],
    resource: null,
    sourceCodeId: "code_1",
    expiresAt: future,
    revokedAt: null,
    registration: {
      id: "registration_1",
      clientId: "oauth_client_1",
      status: OAuthRegistrationStatus.APPROVED
    },
    client: { id: "client_1", trustLevel: ClientTrustLevel.APPROVED },
    ...overrides
  };
}

async function createService(row: ReturnType<typeof createTokenRow> | null) {
  const tx = {
    oAuthToken: {
      createMany: vi.fn(),
      updateMany: vi.fn()
    }
  };
  const prisma = {
    client: {
      oAuthToken: {
        findFirst: vi.fn().mockResolvedValue(row),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn()
      },
      $transaction: vi.fn(
        async (callback: (transaction: typeof tx) => unknown) => callback(tx)
      )
    }
  };
  const auditService = { createAuditEvent: vi.fn() };
  const service = await resolveService(OAuthTokensService, [
    { provide: PrismaService, useValue: prisma },
    { provide: AuditTrailService, useValue: auditService }
  ]);

  return { service, prisma, tx, auditService };
}

describe("privacy: OAuthTokensService.issueTokenPair", () => {
  it("stores only token hashes and audits issuance", async () => {
    const { service, tx, auditService } = await createService(null);

    const pair = await service.issueTokenPair({
      registrationId: "registration_1",
      userId: "user_1",
      clientId: "client_1",
      scopes: ["memory.read"],
      resource: null,
      sourceCodeId: "code_1",
      grantType: "authorization_code"
    });

    expect(pair.accessToken).toMatch(/^fvoa_/);
    expect(pair.refreshToken).toMatch(/^fvor_/);

    const rows = tx.oAuthToken.createMany.mock.calls[0]?.[0].data as Array<{
      type: string;
      tokenHash: string;
    }>;
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      expect(row.tokenHash).not.toContain("fvoa_");
      expect(row.tokenHash).not.toContain("fvor_");
    }

    expect(
      rows.find((row) => row.type === OAuthTokenType.ACCESS)?.tokenHash
    ).toBe(hashOAuthCredential(pair.accessToken));
    expect(
      rows.find((row) => row.type === OAuthTokenType.REFRESH)?.tokenHash
    ).toBe(hashOAuthCredential(pair.refreshToken));

    expect(auditService.createAuditEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: "OAUTH_TOKEN_ISSUED" })
    );
  });
});

describe("privacy: OAuthTokensService.verifyAccessToken", () => {
  it("accepts a live token from an approved grant", async () => {
    const { service } = await createService(createTokenRow());

    const verified = await service.verifyAccessToken("fvoa_token");

    expect(verified?.client.id).toBe("client_1");
    expect(verified?.token.userId).toBe("user_1");
  });

  it("rejects tokens that are not OAuth access tokens", async () => {
    const { service, prisma } = await createService(createTokenRow());

    await expect(service.verifyAccessToken("fvlt_static")).resolves.toBeNull();
    expect(prisma.client.oAuthToken.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
    ["revoked", { revokedAt: new Date() }],
    [
      "pending registration",
      {
        registration: {
          id: "registration_1",
          clientId: "oauth_client_1",
          status: OAuthRegistrationStatus.PENDING
        }
      }
    ],
    [
      "blocked grant client",
      { client: { id: "client_1", trustLevel: ClientTrustLevel.BLOCKED } }
    ]
  ])("rejects %s tokens", async (_label, overrides) => {
    const { service } = await createService(createTokenRow(overrides));

    await expect(service.verifyAccessToken("fvoa_token")).resolves.toBeNull();
  });
});

describe("privacy: OAuthTokensService.verifyRefreshToken", () => {
  it("flags revoked refresh tokens as reuse", async () => {
    const { service } = await createService(
      createTokenRow({ type: OAuthTokenType.REFRESH, revokedAt: new Date() })
    );

    const result = await service.verifyRefreshToken("fvor_token");

    expect(result.status).toBe("reused");
  });
});

describe("privacy: OAuthTokensService.revokeTokensForClient", () => {
  it("revokes every live token for the grant and audits the cutoff", async () => {
    const { service, prisma, auditService } = await createService(null);
    prisma.client.oAuthToken.findMany.mockResolvedValue([
      { id: "token_1", userId: "user_1" },
      { id: "token_2", userId: "user_1" }
    ]);

    const revoked = await service.revokeTokensForClient(
      "client_1",
      "grant_revoked",
      { actorType: "USER", actorId: "user_1" } as never
    );

    expect(revoked).toBe(2);
    expect(prisma.client.oAuthToken.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["token_1", "token_2"] } },
      data: { revokedAt: expect.any(Date) }
    });
    expect(auditService.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "OAUTH_TOKEN_REVOKED",
        metadata: { reason: "grant_revoked", revokedTokens: 2 }
      })
    );
  });

  it("does nothing when the grant has no live tokens", async () => {
    const { service, auditService } = await createService(null);

    const revoked = await service.revokeTokensForClient(
      "client_1",
      "grant_revoked",
      { actorType: "USER", actorId: "user_1" } as never
    );

    expect(revoked).toBe(0);
    expect(auditService.createAuditEvent).not.toHaveBeenCalled();
  });
});
