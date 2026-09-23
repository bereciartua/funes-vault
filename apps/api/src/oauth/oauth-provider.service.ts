import {
  AuditActorType,
  ClientTrustLevel,
  OAuthRegistrationStatus,
  OAuthTokenType
} from "@funes-vault/db";
import { oauthSupportedScopes } from "@funes-vault/shared";
import {
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  AuthorizationParams,
  OAuthServerProvider
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { Injectable } from "@nestjs/common";
import type { Response } from "express";

import { PrismaService } from "../prisma/prisma.service.js";
import {
  oauthAuthorizationRequestTtlMs,
  oauthIssuerUrl,
  oauthMcpResourceUrl
} from "./oauth.config.js";
import { OAuthClientsStoreService } from "./oauth-clients-store.service.js";
import {
  createConsentNonce,
  hashOAuthCredential
} from "./oauth-credentials.js";
import { OAuthTokensService } from "./oauth-tokens.service.js";

const supportedScopes = new Set<string>(oauthSupportedScopes);

/** @internal */
export function resolveRequestedScopes(scopes: string[] | undefined) {
  if (!scopes || scopes.length === 0) {
    // Connectors commonly omit scope entirely; the consent screen still
    // shows exactly what will be granted.
    return [...oauthSupportedScopes];
  }

  const unknown = scopes.filter((scope) => !supportedScopes.has(scope));

  if (unknown.length > 0) {
    throw new InvalidScopeError(`Unsupported scopes: ${unknown.join(" ")}`);
  }

  return [...new Set(scopes)];
}

function assertResourceAllowed(resource: URL | undefined) {
  if (!resource) {
    return null;
  }

  const expected = oauthMcpResourceUrl();
  const normalized = resource.href.replace(/#.*$/, "").replace(/\/+$/, "");
  const allowed = expected.href.replace(/\/+$/, "");

  if (normalized !== allowed) {
    throw new InvalidTargetError(
      `This authorization server only serves ${allowed}`
    );
  }

  return normalized;
}

/**
 * Owns OAuth protocol exchanges and token verification.
 * Tenant boundary: public registrations are separate from grants bound to an authenticated user.
 * Audit: grant and token changes use AuditTrailService; opaque credentials are stored as hashes.
 */
@Injectable()
export class OAuthProviderService implements OAuthServerProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsStoreService: OAuthClientsStoreService,
    private readonly tokensService: OAuthTokensService
  ) {}

  get clientsStore() {
    return this.clientsStoreService;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const scopes = resolveRequestedScopes(params.scopes);
    const resource = assertResourceAllowed(params.resource);
    const registration =
      await this.prisma.client.oAuthClientRegistration.findUnique({
        where: { clientId: client.client_id },
        select: { id: true }
      });

    if (!registration) {
      throw new InvalidGrantError("Unknown client");
    }

    const nonce = createConsentNonce();
    const request = await this.prisma.client.oAuthAuthorizationRequest.create({
      data: {
        registrationId: registration.id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        scopes,
        state: params.state ?? null,
        resource,
        csrfTokenHash: hashOAuthCredential(nonce),
        expiresAt: new Date(Date.now() + oauthAuthorizationRequestTtlMs())
      }
    });

    const consentUrl = new URL("/oauth/consent", oauthIssuerUrl());
    consentUrl.searchParams.set("request", request.id);
    consentUrl.searchParams.set("nonce", nonce);

    res.redirect(302, consentUrl.href);
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const code = await this.prisma.client.oAuthAuthorizationCode.findUnique({
      where: { codeHash: hashOAuthCredential(authorizationCode) },
      include: { registration: { select: { clientId: true } } }
    });

    if (!code || code.registration.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }

    return code.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    const code = await this.prisma.client.oAuthAuthorizationCode.findUnique({
      where: { codeHash: hashOAuthCredential(authorizationCode) },
      include: { registration: true, client: true }
    });

    if (!code || code.registration.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }

    if (code.consumedAt) {
      // Replayed codes are treated as compromise: every token minted from
      // this code is revoked (OAuth 2.1, section 4.1.2).
      await this.tokensService.revokeTokensForSourceCode(
        code.id,
        "authorization_code_reuse"
      );
      throw new InvalidGrantError("Authorization code already used");
    }

    if (code.expiresAt <= new Date()) {
      throw new InvalidGrantError("Authorization code expired");
    }

    if (redirectUri && redirectUri !== code.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match");
    }

    const requestedResource = assertResourceAllowed(resource);

    if (
      code.resource &&
      requestedResource &&
      code.resource !== requestedResource
    ) {
      throw new InvalidTargetError("resource does not match");
    }

    if (
      code.registration.status !== OAuthRegistrationStatus.APPROVED ||
      code.client.trustLevel !== ClientTrustLevel.APPROVED
    ) {
      throw new InvalidGrantError("Client grant is not approved");
    }

    const consumed = await this.prisma.client.oAuthAuthorizationCode.updateMany(
      {
        where: { id: code.id, consumedAt: null },
        data: { consumedAt: new Date() }
      }
    );

    if (consumed.count === 0) {
      throw new InvalidGrantError("Authorization code already used");
    }

    const pair = await this.tokensService.issueTokenPair({
      registrationId: code.registrationId,
      userId: code.userId,
      clientId: code.clientId,
      scopes: code.scopes,
      resource: code.resource,
      sourceCodeId: code.id,
      grantType: "authorization_code"
    });

    return this.toOAuthTokens(pair);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const verified = await this.tokensService.verifyRefreshToken(refreshToken);

    if (verified.status === "reused") {
      await this.tokensService.revokeTokensForClient(
        verified.token.clientId,
        "refresh_token_reuse",
        { actorType: AuditActorType.SYSTEM, actorId: null }
      );
      throw new InvalidGrantError("Refresh token is no longer valid");
    }

    if (
      verified.status === "invalid" ||
      verified.token.registration.clientId !== client.client_id
    ) {
      throw new InvalidGrantError("Invalid refresh token");
    }

    const granted = new Set(verified.token.scopes);
    const requested =
      scopes && scopes.length > 0 ? scopes : verified.token.scopes;
    const narrowed = requested.filter((scope) => granted.has(scope));

    if (narrowed.length !== requested.length) {
      throw new InvalidScopeError("Requested scopes exceed the original grant");
    }

    const requestedResource = assertResourceAllowed(resource);

    if (
      verified.token.resource &&
      requestedResource &&
      verified.token.resource !== requestedResource
    ) {
      throw new InvalidTargetError("resource does not match");
    }

    // Rotation: the presented refresh token is spent the moment a new pair
    // is minted; presenting it again trips the reuse revocation above.
    await this.tokensService.revokeTokenById(verified.token.id);

    const pair = await this.tokensService.issueTokenPair({
      registrationId: verified.token.registrationId,
      userId: verified.token.userId,
      clientId: verified.token.clientId,
      scopes: narrowed,
      resource: verified.token.resource,
      sourceCodeId: verified.token.sourceCodeId,
      grantType: "refresh_token"
    });

    return this.toOAuthTokens(pair);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const verified = await this.tokensService.verifyAccessToken(token);

    if (!verified) {
      throw new InvalidTokenError("Invalid access token");
    }

    return {
      token,
      clientId: verified.registration.clientId,
      scopes: verified.token.scopes,
      expiresAt: Math.floor(verified.token.expiresAt.getTime() / 1000),
      resource: verified.token.resource
        ? new URL(verified.token.resource)
        : undefined,
      extra: {
        userId: verified.token.userId,
        grantClientId: verified.token.clientId
      }
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const hash = hashOAuthCredential(request.token);
    const row = await this.prisma.client.oAuthToken.findFirst({
      where: {
        tokenHash: hash,
        registration: { clientId: client.client_id }
      }
    });

    // Unknown or foreign tokens are ignored per RFC 7009.
    if (!row || row.revokedAt) {
      return;
    }

    if (row.type === OAuthTokenType.REFRESH) {
      // Revoking the refresh token ends the grant's whole token family.
      await this.tokensService.revokeTokensForClient(
        row.clientId,
        "connector_revocation",
        { actorType: AuditActorType.CLIENT, actorId: row.clientId }
      );

      return;
    }

    await this.tokensService.revokeAccessToken(row, "connector_revocation");
  }

  private toOAuthTokens(pair: {
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
    scopes: string[];
  }): OAuthTokens {
    return {
      access_token: pair.accessToken,
      token_type: "bearer",
      expires_in: pair.expiresInSeconds,
      scope: pair.scopes.join(" "),
      refresh_token: pair.refreshToken
    };
  }
}
