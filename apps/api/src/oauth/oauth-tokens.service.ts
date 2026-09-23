import {
  AuditActorType,
  AuditEventType,
  type Client,
  ClientTrustLevel,
  type OAuthClientRegistration,
  OAuthRegistrationStatus,
  type OAuthToken,
  OAuthTokenType,
  type Prisma
} from "@funes-vault/db";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  oauthAccessTokenTtlSeconds,
  oauthRefreshTokenTtlSeconds
} from "./oauth.config.js";
import {
  createOAuthAccessToken,
  createOAuthRefreshToken,
  hashOAuthCredential
} from "./oauth-credentials.js";

export type IssuedTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scopes: string[];
};

export type VerifiedAccessToken = {
  token: OAuthToken;
  registration: OAuthClientRegistration;
  client: Client;
};

type IssueInput = {
  registrationId: string;
  userId: string;
  clientId: string;
  scopes: string[];
  resource: string | null;
  sourceCodeId: string | null;
  grantType: "authorization_code" | "refresh_token";
};

type TokenWithGrant = Prisma.OAuthTokenGetPayload<{
  include: { registration: true; client: true };
}>;

/**
 * Owns hashed token issuance, verification, rotation, and revocation.
 * Tenant boundary: public registrations are separate from grants bound to an authenticated user.
 * Audit: grant and token changes use AuditTrailService; opaque credentials are stored as hashes.
 */
@Injectable()
export class OAuthTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditTrailService
  ) {}

  async issueTokenPair(input: IssueInput): Promise<IssuedTokenPair> {
    const accessToken = createOAuthAccessToken();
    const refreshToken = createOAuthRefreshToken();
    const expiresInSeconds = oauthAccessTokenTtlSeconds();
    const now = Date.now();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.oAuthToken.createMany({
        data: [
          {
            registrationId: input.registrationId,
            userId: input.userId,
            clientId: input.clientId,
            type: OAuthTokenType.ACCESS,
            tokenHash: hashOAuthCredential(accessToken),
            scopes: input.scopes,
            resource: input.resource,
            sourceCodeId: input.sourceCodeId,
            expiresAt: new Date(now + expiresInSeconds * 1000)
          },
          {
            registrationId: input.registrationId,
            userId: input.userId,
            clientId: input.clientId,
            type: OAuthTokenType.REFRESH,
            tokenHash: hashOAuthCredential(refreshToken),
            scopes: input.scopes,
            resource: input.resource,
            sourceCodeId: input.sourceCodeId,
            expiresAt: new Date(now + oauthRefreshTokenTtlSeconds() * 1000)
          }
        ]
      });

      await this.auditService.createAuditEvent(tx, {
        userId: input.userId,
        clientId: input.clientId,
        type: AuditEventType.OAUTH_TOKEN_ISSUED,
        actorType: AuditActorType.CLIENT,
        actorId: input.clientId,
        metadata: {
          grantType: input.grantType,
          scopes: input.scopes,
          expiresInSeconds
        }
      });
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds,
      scopes: input.scopes
    };
  }

  async findToken(token: string, type: OAuthTokenType) {
    return this.prisma.client.oAuthToken.findFirst({
      where: { tokenHash: hashOAuthCredential(token), type },
      include: { registration: true, client: true }
    });
  }

  async verifyAccessToken(token: string): Promise<VerifiedAccessToken | null> {
    if (!token.startsWith("fvoa_")) {
      return null;
    }

    const row = await this.findToken(token, OAuthTokenType.ACCESS);

    if (!row || !this.isUsableGrant(row)) {
      return null;
    }

    return { token: row, registration: row.registration, client: row.client };
  }

  async verifyRefreshToken(
    token: string
  ): Promise<
    | { status: "valid"; token: TokenWithGrant }
    | { status: "reused"; token: TokenWithGrant }
    | { status: "invalid" }
  > {
    const row = await this.findToken(token, OAuthTokenType.REFRESH);

    if (!row) {
      return { status: "invalid" };
    }

    // A revoked refresh token presented again signals token theft on either
    // side of the rotation; the whole grant's token family is cut off.
    if (row.revokedAt) {
      return { status: "reused", token: row };
    }

    if (row.expiresAt <= new Date() || !this.isUsableGrant(row)) {
      return { status: "invalid" };
    }

    return { status: "valid", token: row };
  }

  async revokeAccessToken(
    token: Pick<OAuthToken, "id" | "userId" | "clientId">,
    reason: string
  ) {
    await this.revokeTokens(
      [token.id],
      { userId: token.userId, clientId: token.clientId },
      reason,
      { actorType: AuditActorType.CLIENT, actorId: token.clientId }
    );
  }

  async revokeTokenById(id: string) {
    await this.prisma.client.oAuthToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  async revokeTokensForSourceCode(sourceCodeId: string, reason: string) {
    const tokens = await this.prisma.client.oAuthToken.findMany({
      where: { sourceCodeId, revokedAt: null },
      select: { id: true, userId: true, clientId: true }
    });
    const [first] = tokens;

    if (!first) {
      return 0;
    }

    return this.revokeTokens(
      tokens.map((token) => token.id),
      { userId: first.userId, clientId: first.clientId },
      reason,
      { actorType: AuditActorType.SYSTEM, actorId: null }
    );
  }

  async revokeTokensForClient(
    clientId: string,
    reason: string,
    actor: { actorType: AuditActorType; actorId: string | null },
    tx?: Prisma.TransactionClient
  ) {
    const db = tx ?? this.prisma.client;
    const tokens = await db.oAuthToken.findMany({
      where: { clientId, revokedAt: null },
      select: { id: true, userId: true }
    });
    const [first] = tokens;

    if (!first) {
      return 0;
    }

    await db.oAuthToken.updateMany({
      where: { id: { in: tokens.map((token) => token.id) } },
      data: { revokedAt: new Date() }
    });

    await this.auditService.createAuditEvent(tx ?? this.prisma.client, {
      userId: first.userId,
      clientId,
      type: AuditEventType.OAUTH_TOKEN_REVOKED,
      actorType: actor.actorType,
      actorId: actor.actorId,
      metadata: { reason, revokedTokens: tokens.length }
    });

    return tokens.length;
  }

  private async revokeTokens(
    ids: string[],
    grant: { userId: string; clientId: string },
    reason: string,
    actor: { actorType: AuditActorType; actorId: string | null }
  ) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.oAuthToken.updateMany({
        where: { id: { in: ids } },
        data: { revokedAt: new Date() }
      });

      await this.auditService.createAuditEvent(tx, {
        userId: grant.userId,
        clientId: grant.clientId,
        type: AuditEventType.OAUTH_TOKEN_REVOKED,
        actorType: actor.actorType,
        actorId: actor.actorId,
        metadata: { reason, revokedTokens: ids.length }
      });
    });

    return ids.length;
  }

  private isUsableGrant(row: TokenWithGrant) {
    return (
      !row.revokedAt &&
      row.expiresAt > new Date() &&
      row.registration.status === OAuthRegistrationStatus.APPROVED &&
      row.client.trustLevel === ClientTrustLevel.APPROVED
    );
  }
}
