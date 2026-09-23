import {
  ClientTrustLevel,
  OAuthRegistrationStatus,
  OAuthTokenType
} from "@funes-vault/db";
import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { OAuthClientsStoreService } from "./oauth-clients-store.service.js";
import { hashOAuthCredential } from "./oauth-credentials.js";
import {
  OAuthProviderService,
  resolveRequestedScopes
} from "./oauth-provider.service.js";
import { OAuthTokensService } from "./oauth-tokens.service.js";

const clientInfo = {
  client_id: "oauth_client_1",
  redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  token_endpoint_auth_method: "none"
};

const future = new Date(Date.now() + 60_000);

function createCode(overrides: Record<string, unknown> = {}) {
  return {
    id: "code_1",
    registrationId: "registration_1",
    userId: "user_1",
    clientId: "client_1",
    codeHash: hashOAuthCredential("fvac_code"),
    redirectUri: "https://claude.ai/api/mcp/auth_callback",
    codeChallenge: "challenge",
    scopes: ["memory.read"],
    resource: null,
    expiresAt: future,
    consumedAt: null,
    registration: {
      id: "registration_1",
      clientId: "oauth_client_1",
      status: OAuthRegistrationStatus.APPROVED
    },
    client: { id: "client_1", trustLevel: ClientTrustLevel.APPROVED },
    ...overrides
  };
}

async function createProvider(input: {
  code?: ReturnType<typeof createCode> | null;
  registration?: unknown;
}) {
  const prisma = {
    client: {
      oAuthAuthorizationCode: {
        findUnique: vi.fn().mockResolvedValue(input.code ?? null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      oAuthAuthorizationRequest: {
        create: vi.fn().mockResolvedValue({ id: "request_1" })
      },
      oAuthClientRegistration: {
        findUnique: vi
          .fn()
          .mockResolvedValue(input.registration ?? { id: "registration_1" })
      },
      oAuthToken: { findFirst: vi.fn() }
    }
  };
  const tokensService = {
    issueTokenPair: vi.fn().mockResolvedValue({
      accessToken: "fvoa_access",
      refreshToken: "fvor_refresh",
      expiresInSeconds: 3600,
      scopes: ["memory.read"]
    }),
    verifyAccessToken: vi.fn(),
    verifyRefreshToken: vi.fn(),
    revokeTokenById: vi.fn(),
    revokeTokensForClient: vi.fn(),
    revokeTokensForSourceCode: vi.fn()
  };
  const provider = await createService(OAuthProviderService, [
    { provide: PrismaService, useValue: prisma },
    { provide: OAuthClientsStoreService, useValue: {} },
    { provide: OAuthTokensService, useValue: tokensService }
  ]);

  return { provider, prisma, tokensService };
}

describe("privacy: resolveRequestedScopes", () => {
  it("defaults to all supported scopes when none are requested", () => {
    expect(resolveRequestedScopes(undefined)).toEqual([
      "memory.read",
      "memory.suggest"
    ]);
    expect(resolveRequestedScopes([])).toEqual([
      "memory.read",
      "memory.suggest"
    ]);
  });

  it("rejects unknown scopes", () => {
    expect(() => resolveRequestedScopes(["memory.read", "admin"])).toThrow(
      "Unsupported scopes: admin"
    );
  });
});

describe("privacy: OAuthProviderService.authorize", () => {
  it("stores the PKCE challenge and redirects to the consent screen", async () => {
    const { provider, prisma } = await createProvider({});
    const res = { redirect: vi.fn() };

    await provider.authorize(
      clientInfo,
      {
        state: "xyz",
        scopes: ["memory.read"],
        codeChallenge: "challenge-abc",
        redirectUri: "https://claude.ai/api/mcp/auth_callback"
      },
      res as never
    );

    const created =
      prisma.client.oAuthAuthorizationRequest.create.mock.calls[0]?.[0].data;
    expect(created.codeChallenge).toBe("challenge-abc");
    expect(created.scopes).toEqual(["memory.read"]);
    expect(created.csrfTokenHash).toBeTruthy();

    const [status, url] = res.redirect.mock.calls[0] ?? [];
    expect(status).toBe(302);
    const consentUrl = new URL(url);
    expect(consentUrl.pathname).toBe("/oauth/consent");
    expect(consentUrl.searchParams.get("request")).toBe("request_1");
    expect(
      hashOAuthCredential(consentUrl.searchParams.get("nonce") ?? "")
    ).toBe(created.csrfTokenHash);
  });
});

describe("privacy: OAuthProviderService.challengeForAuthorizationCode", () => {
  it("returns the stored challenge for the owning client only", async () => {
    const { provider } = await createProvider({ code: createCode() });

    await expect(
      provider.challengeForAuthorizationCode(clientInfo as never, "fvac_code")
    ).resolves.toBe("challenge");

    await expect(
      provider.challengeForAuthorizationCode(
        { ...clientInfo, client_id: "other" },
        "fvac_code"
      )
    ).rejects.toThrow("Invalid authorization code");
  });
});

describe("privacy: OAuthProviderService.exchangeAuthorizationCode", () => {
  it("consumes the code once and issues hashed token pairs", async () => {
    const { provider, prisma, tokensService } = await createProvider({
      code: createCode()
    });

    const tokens = await provider.exchangeAuthorizationCode(
      clientInfo,
      "fvac_code",
      undefined,
      "https://claude.ai/api/mcp/auth_callback"
    );

    expect(
      prisma.client.oAuthAuthorizationCode.updateMany
    ).toHaveBeenCalledWith({
      where: { id: "code_1", consumedAt: null },
      data: expect.anything()
    });
    expect(tokensService.issueTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        clientId: "client_1",
        scopes: ["memory.read"],
        grantType: "authorization_code"
      })
    );
    expect(tokens).toEqual(
      expect.objectContaining({
        access_token: "fvoa_access",
        refresh_token: "fvor_refresh",
        token_type: "bearer",
        expires_in: 3600
      })
    );
  });

  it("revokes the token family when a code is replayed", async () => {
    const { provider, tokensService } = await createProvider({
      code: createCode({ consumedAt: new Date() })
    });

    await expect(
      provider.exchangeAuthorizationCode(clientInfo as never, "fvac_code")
    ).rejects.toThrow("already used");
    expect(tokensService.revokeTokensForSourceCode).toHaveBeenCalledWith(
      "code_1",
      "authorization_code_reuse"
    );
  });

  it("rejects expired codes, mismatched redirect URIs, and unapproved grants", async () => {
    const expired = await createProvider({
      code: createCode({ expiresAt: new Date(Date.now() - 1000) })
    });
    await expect(
      expired.provider.exchangeAuthorizationCode(
        clientInfo as never,
        "fvac_code"
      )
    ).rejects.toThrow("expired");

    const mismatch = await createProvider({ code: createCode() });
    await expect(
      mismatch.provider.exchangeAuthorizationCode(
        clientInfo as never,
        "fvac_code",
        undefined,
        "https://evil.example/callback"
      )
    ).rejects.toThrow("redirect_uri does not match");

    const pending = await createProvider({
      code: createCode({
        registration: {
          id: "registration_1",
          clientId: "oauth_client_1",
          status: OAuthRegistrationStatus.PENDING
        }
      })
    });
    await expect(
      pending.provider.exchangeAuthorizationCode(
        clientInfo as never,
        "fvac_code"
      )
    ).rejects.toThrow("not approved");

    const blocked = await createProvider({
      code: createCode({
        client: { id: "client_1", trustLevel: ClientTrustLevel.BLOCKED }
      })
    });
    await expect(
      blocked.provider.exchangeAuthorizationCode(
        clientInfo as never,
        "fvac_code"
      )
    ).rejects.toThrow("not approved");
  });
});

describe("privacy: OAuthProviderService.exchangeRefreshToken", () => {
  const refreshRow = {
    id: "token_refresh",
    registrationId: "registration_1",
    userId: "user_1",
    clientId: "client_1",
    type: OAuthTokenType.REFRESH,
    scopes: ["memory.read", "memory.suggest"],
    resource: null,
    sourceCodeId: "code_1",
    registration: {
      clientId: "oauth_client_1",
      status: OAuthRegistrationStatus.APPROVED
    },
    client: { trustLevel: ClientTrustLevel.APPROVED }
  };

  it("rotates the refresh token and narrows scopes", async () => {
    const { provider, tokensService } = await createProvider({});
    tokensService.verifyRefreshToken.mockResolvedValue({
      status: "valid",
      token: refreshRow
    });

    await provider.exchangeRefreshToken(clientInfo, "fvor_refresh", [
      "memory.read"
    ]);

    expect(tokensService.revokeTokenById).toHaveBeenCalledWith("token_refresh");
    expect(tokensService.issueTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: ["memory.read"],
        grantType: "refresh_token"
      })
    );
  });

  it("rejects scope escalation beyond the original grant", async () => {
    const { provider, tokensService } = await createProvider({});
    tokensService.verifyRefreshToken.mockResolvedValue({
      status: "valid",
      token: { ...refreshRow, scopes: ["memory.read"] }
    });

    await expect(
      provider.exchangeRefreshToken(clientInfo as never, "fvor_refresh", [
        "memory.read",
        "memory.suggest"
      ])
    ).rejects.toThrow("exceed the original grant");
    expect(tokensService.issueTokenPair).not.toHaveBeenCalled();
  });

  it("revokes the whole grant family on refresh token reuse", async () => {
    const { provider, tokensService } = await createProvider({});
    tokensService.verifyRefreshToken.mockResolvedValue({
      status: "reused",
      token: refreshRow
    });

    await expect(
      provider.exchangeRefreshToken(clientInfo as never, "fvor_refresh")
    ).rejects.toThrow("no longer valid");
    expect(tokensService.revokeTokensForClient).toHaveBeenCalledWith(
      "client_1",
      "refresh_token_reuse",
      expect.anything()
    );
  });
});

describe("privacy: OAuthProviderService.verifyAccessToken", () => {
  it("maps a valid token to AuthInfo with the grant identity", async () => {
    const { provider, tokensService } = await createProvider({});
    tokensService.verifyAccessToken.mockResolvedValue({
      token: {
        scopes: ["memory.read"],
        expiresAt: future,
        resource: null,
        userId: "user_1",
        clientId: "client_1"
      },
      registration: { clientId: "oauth_client_1" },
      client: { id: "client_1" }
    });

    const info = await provider.verifyAccessToken("fvoa_access");

    expect(info.clientId).toBe("oauth_client_1");
    expect(info.scopes).toEqual(["memory.read"]);
    expect(info.extra).toEqual({ userId: "user_1", grantClientId: "client_1" });
  });

  it("rejects unknown tokens", async () => {
    const { provider, tokensService } = await createProvider({});
    tokensService.verifyAccessToken.mockResolvedValue(null);

    await expect(provider.verifyAccessToken("fvoa_bad")).rejects.toThrow(
      "Invalid access token"
    );
  });
});
