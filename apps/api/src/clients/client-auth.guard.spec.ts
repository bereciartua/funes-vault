import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { OAuthTokensService } from "../oauth/oauth-tokens.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ClientAuthGuard } from "./client-auth.guard.js";
import { hashToken } from "./client-token.js";

const now = new Date("2026-07-04T12:00:00.000Z");

function createClientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "client_1",
    _count: { policies: 1 },
    userId: "user_1",
    name: "Claude",
    type: "MCP_CLIENT",
    trustLevel: "APPROVED",
    declaredRetention: "UNKNOWN",
    tokenHash: null,
    oauthRegistrationId: "registration_1",
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => "handler",
    getClass: () => "class"
  } as unknown as ExecutionContext;
}

async function createGuard(input: {
  staticClient?: ReturnType<typeof createClientRow> | null;
  verified?: unknown;
  requiredScope?: string;
}) {
  const prisma = {
    client: {
      client: {
        findFirst: vi.fn().mockResolvedValue(input.staticClient ?? null),
        update: vi.fn(async ({ where }: { where: { id: string } }) =>
          createClientRow({ id: where.id, lastUsedAt: now })
        )
      }
    }
  };
  const oauthTokens = {
    verifyAccessToken: vi.fn().mockResolvedValue(input.verified ?? null)
  };
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(input.requiredScope)
  };
  const guard = await createService(ClientAuthGuard, [
    { provide: PrismaService, useValue: prisma },
    { provide: OAuthTokensService, useValue: oauthTokens },
    { provide: Reflector, useValue: reflector }
  ]);

  return { guard, prisma, oauthTokens };
}

describe("privacy: ClientAuthGuard", () => {
  it("accepts static client tokens without consulting OAuth", async () => {
    const staticClient = createClientRow({
      tokenHash: hashToken("fvlt_static"),
      oauthRegistrationId: null
    });
    const { guard, oauthTokens } = await createGuard({ staticClient });
    const request = { headers: { authorization: "Bearer fvlt_static" } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(oauthTokens.verifyAccessToken).not.toHaveBeenCalled();
    expect(request).toEqual(
      expect.objectContaining({
        clientTokenType: "static",
        clientUserId: "user_1"
      })
    );
  });

  it("maps OAuth access tokens onto the user-scoped client grant", async () => {
    const { guard, prisma } = await createGuard({
      verified: {
        token: { scopes: ["memory.read"], userId: "user_1" },
        registration: { clientId: "oauth_client_1" },
        client: createClientRow()
      }
    });
    const request = { headers: { authorization: "Bearer fvoa_token" } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(prisma.client.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "client_1" } })
    );
    expect(request).toEqual(
      expect.objectContaining({
        clientTokenType: "oauth",
        clientUserId: "user_1",
        oauthScopes: ["memory.read"]
      })
    );
  });

  it("rejects OAuth tokens missing the route's required scope", async () => {
    const { guard } = await createGuard({
      verified: {
        token: { scopes: ["memory.read"], userId: "user_1" },
        registration: { clientId: "oauth_client_1" },
        client: createClientRow()
      },
      requiredScope: "memory.suggest"
    });
    const request = { headers: { authorization: "Bearer fvoa_token" } };

    await expect(
      guard.canActivate(createContext(request))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows static tokens through scope-guarded routes", async () => {
    const staticClient = createClientRow({
      tokenHash: hashToken("fvlt_static"),
      oauthRegistrationId: null
    });
    const { guard } = await createGuard({
      staticClient,
      requiredScope: "memory.suggest"
    });
    const request = { headers: { authorization: "Bearer fvlt_static" } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it("rejects tokens that are neither static nor valid OAuth tokens", async () => {
    const { guard } = await createGuard({});
    const request = { headers: { authorization: "Bearer fvoa_revoked" } };

    await expect(
      guard.canActivate(createContext(request))
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
