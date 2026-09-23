import {
  AuditActorType,
  AuditEventType,
  ClientRetention,
  ClientTrustLevel,
  ClientType,
  MemorySensitivity,
  OAuthRegistrationStatus,
  PolicyOperation,
  type Prisma
} from "@funes-vault/db";
import { oauthScopeRead, oauthScopeSuggest } from "@funes-vault/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { apiEnv } from "../config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  mcpConnectorPurpose,
  oauthAuthorizationCodeTtlMs
} from "./oauth.config.js";
import {
  createOAuthAuthorizationCode,
  credentialMatchesHash,
  hashOAuthCredential
} from "./oauth-credentials.js";

const connectorSensitivityValues = Object.values(MemorySensitivity);

// Third-party connectors get a conservative default disclosure ceiling; the
// user can raise or lower it afterwards in Apps & access like any policy.
export function defaultConnectorMaxSensitivity(): MemorySensitivity {
  const configured = apiEnv().MCP_CONNECTOR_MAX_SENSITIVITY;

  if (
    configured &&
    connectorSensitivityValues.includes(configured as MemorySensitivity)
  ) {
    return configured as MemorySensitivity;
  }

  return MemorySensitivity.INTERNAL;
}

export function scopesToOperations(scopes: string[]): PolicyOperation[] {
  const operations: PolicyOperation[] = [];

  if (scopes.includes(oauthScopeRead)) {
    operations.push(PolicyOperation.READ);
  }

  if (scopes.includes(oauthScopeSuggest)) {
    operations.push(PolicyOperation.SUGGEST);
  }

  return operations;
}

export type ConsentContext = {
  requestId: string;
  clientName: string;
  clientUri: string | null;
  logoUri: string | null;
  redirectHost: string;
  redirectOrigin: string;
  scopes: string[];
  registrationStatus: OAuthRegistrationStatus;
  maxSensitivity: MemorySensitivity;
};

type ConsentDecisionInput = {
  userId: string;
  requestId: string;
  nonce: string;
};

/**
 * Owns owner consent decisions and connector grant creation.
 * Tenant boundary: public registrations are separate from grants bound to an authenticated user.
 * Audit: grant and token changes use AuditTrailService; opaque credentials are stored as hashes.
 */
@Injectable()
export class OAuthGrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditTrailService
  ) {}

  async getConsentContext(requestId: string): Promise<ConsentContext> {
    const request = await this.loadPendingRequest(requestId);

    return {
      requestId: request.id,
      clientName: request.registration.name,
      clientUri: request.registration.clientUri,
      logoUri: request.registration.logoUri,
      redirectHost: new URL(request.redirectUri).host,
      redirectOrigin: new URL(request.redirectUri).origin,
      scopes: request.scopes,
      registrationStatus: request.registration.status,
      maxSensitivity: defaultConnectorMaxSensitivity()
    };
  }

  async approve(input: ConsentDecisionInput) {
    const request = await this.loadPendingRequest(input.requestId, input.nonce);
    const code = createOAuthAuthorizationCode();

    await this.prisma.client.$transaction(async (tx) => {
      const client = await this.ensureGrantClient(tx, {
        userId: input.userId,
        registrationId: request.registrationId,
        registrationName: request.registration.name,
        registrationClientId: request.registration.clientId
      });

      await this.ensureGrantPolicy(tx, {
        userId: input.userId,
        clientId: client.id,
        scopes: request.scopes
      });

      if (request.registration.status === OAuthRegistrationStatus.PENDING) {
        await tx.oAuthClientRegistration.update({
          where: { id: request.registrationId },
          data: { status: OAuthRegistrationStatus.APPROVED }
        });
      }

      await tx.oAuthAuthorizationCode.create({
        data: {
          registrationId: request.registrationId,
          userId: input.userId,
          clientId: client.id,
          codeHash: hashOAuthCredential(code),
          redirectUri: request.redirectUri,
          codeChallenge: request.codeChallenge,
          scopes: request.scopes,
          resource: request.resource,
          expiresAt: new Date(Date.now() + oauthAuthorizationCodeTtlMs())
        }
      });

      await tx.oAuthAuthorizationRequest.update({
        where: { id: request.id },
        data: { decidedAt: new Date() }
      });

      await this.auditService.createAuditEvent(tx, {
        userId: input.userId,
        clientId: client.id,
        type: AuditEventType.OAUTH_GRANT_APPROVED,
        actorType: AuditActorType.USER,
        actorId: input.userId,
        metadata: {
          oauthClientId: request.registration.clientId,
          clientName: request.registration.name,
          scopes: request.scopes,
          redirectHost: new URL(request.redirectUri).host
        }
      });
    });

    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set("code", code);

    if (request.state) {
      redirect.searchParams.set("state", request.state);
    }

    return { redirectUrl: redirect.href };
  }

  async deny(input: ConsentDecisionInput) {
    const request = await this.loadPendingRequest(input.requestId, input.nonce);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.oAuthAuthorizationRequest.update({
        where: { id: request.id },
        data: { decidedAt: new Date() }
      });

      await this.auditService.createAuditEvent(tx, {
        userId: input.userId,
        clientId: null,
        type: AuditEventType.OAUTH_GRANT_DENIED,
        actorType: AuditActorType.USER,
        actorId: input.userId,
        metadata: {
          oauthClientId: request.registration.clientId,
          clientName: request.registration.name,
          scopes: request.scopes
        }
      });
    });

    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("error_description", "The user denied access");

    if (request.state) {
      redirect.searchParams.set("state", request.state);
    }

    return { redirectUrl: redirect.href };
  }

  private async loadPendingRequest(requestId: string, nonce?: string) {
    const request =
      await this.prisma.client.oAuthAuthorizationRequest.findUnique({
        where: { id: requestId },
        include: { registration: true }
      });

    if (
      !request ||
      request.registration.status === OAuthRegistrationStatus.BLOCKED
    ) {
      throw new NotFoundException("Authorization request not found");
    }

    if (request.decidedAt) {
      throw new ConflictException(
        "This authorization request was already decided"
      );
    }

    if (request.expiresAt <= new Date()) {
      throw new BadRequestException("This authorization request has expired");
    }

    if (
      nonce !== undefined &&
      !credentialMatchesHash(nonce, request.csrfTokenHash)
    ) {
      throw new BadRequestException("Invalid consent nonce");
    }

    return request;
  }

  private async ensureGrantClient(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      registrationId: string;
      registrationName: string;
      registrationClientId: string;
    }
  ) {
    const existing = await tx.client.findFirst({
      where: {
        userId: input.userId,
        oauthRegistrationId: input.registrationId
      }
    });

    if (existing) {
      if (existing.trustLevel !== ClientTrustLevel.APPROVED) {
        return tx.client.update({
          where: { id: existing.id },
          data: { trustLevel: ClientTrustLevel.APPROVED }
        });
      }

      return existing;
    }

    const baseName = input.registrationName;
    const takenName = await tx.client.findFirst({
      where: { userId: input.userId, name: baseName },
      select: { id: true }
    });
    const name = takenName
      ? `${baseName} (${input.registrationClientId.slice(0, 8)})`
      : baseName;

    const created = await tx.client.create({
      data: {
        userId: input.userId,
        name,
        type: ClientType.MCP_CLIENT,
        trustLevel: ClientTrustLevel.APPROVED,
        declaredRetention: ClientRetention.UNKNOWN,
        oauthRegistrationId: input.registrationId
      }
    });

    await this.auditService.createAuditEvent(tx, {
      userId: input.userId,
      clientId: created.id,
      type: AuditEventType.CLIENT_CREATED,
      actorType: AuditActorType.USER,
      actorId: input.userId,
      metadata: {
        clientId: created.id,
        clientName: created.name,
        trustLevel: created.trustLevel,
        oauthClientId: input.registrationClientId
      }
    });

    return created;
  }

  private async ensureGrantPolicy(
    tx: Prisma.TransactionClient,
    input: { userId: string; clientId: string; scopes: string[] }
  ) {
    const operations = scopesToOperations(input.scopes);
    const existing = await tx.policy.findFirst({
      where: {
        userId: input.userId,
        clientId: input.clientId,
        purpose: mcpConnectorPurpose
      },
      select: { id: true, operations: true }
    });

    if (existing) {
      const merged = [...new Set([...existing.operations, ...operations])];

      if (merged.length !== existing.operations.length) {
        await tx.policy.update({
          where: { id: existing.id },
          data: { operations: merged }
        });
      }

      return existing;
    }

    const categories = await tx.memoryCategory.findMany({
      select: { id: true },
      orderBy: { name: "asc" }
    });
    const created = await tx.policy.create({
      data: {
        userId: input.userId,
        clientId: input.clientId,
        purpose: mcpConnectorPurpose,
        maxSensitivity: defaultConnectorMaxSensitivity(),
        operations,
        requiresConfirmation: false,
        expiresAt: null,
        allowedCategories: {
          connect: categories.map((category) => ({ id: category.id }))
        }
      },
      select: { id: true }
    });

    await this.auditService.createAuditEvent(tx, {
      userId: input.userId,
      clientId: input.clientId,
      type: AuditEventType.POLICY_CREATED,
      actorType: AuditActorType.USER,
      actorId: input.userId,
      metadata: {
        policyId: created.id,
        purpose: mcpConnectorPurpose,
        clientId: input.clientId,
        maxSensitivity: defaultConnectorMaxSensitivity(),
        operations,
        requiresConfirmation: false,
        allowedCategoryCount: categories.length,
        oauthGrant: true
      }
    });

    return created;
  }
}
