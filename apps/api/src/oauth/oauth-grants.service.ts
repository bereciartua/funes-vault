import {
  AuditActorType,
  AuditEventType,
  ClientRetention,
  ClientTrustLevel,
  ClientType,
  OAuthRegistrationStatus,
  type Prisma
} from "@funes-vault/db";
import { appPermissionsLabel } from "@funes-vault/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { isPrismaError } from "../common/prisma-errors.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { oauthAuthorizationCodeTtlMs } from "./oauth.config.js";
import type { ConsentContext } from "./oauth-consent.types.js";
import {
  createOAuthAuthorizationCode,
  credentialMatchesHash,
  hashOAuthCredential
} from "./oauth-credentials.js";
import {
  consentClient,
  defaultConnectorMaxSensitivity,
  resultingOperations,
  scopesToOperations
} from "./oauth-permissions.js";

export type { ConsentContext } from "./oauth-consent.types.js";

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

  async getConsentContext(
    requestId: string,
    userId?: string
  ): Promise<ConsentContext> {
    const request = await this.loadPendingRequest(requestId);
    const client = userId
      ? await consentClient(this.prisma.client, userId, request.registrationId)
      : null;
    const policy = client?.policies[0];

    return {
      requestId: request.id,
      clientName: request.registration.name,
      clientUri: request.registration.clientUri,
      logoUri: request.registration.logoUri,
      redirectHost: new URL(request.redirectUri).host,
      redirectOrigin: new URL(request.redirectUri).origin,
      scopes: request.scopes,
      registrationStatus: request.registration.status,
      operations: resultingOperations(policy?.operations ?? [], request.scopes),
      addedOperations: scopesToOperations(request.scopes).filter(
        (operation) => !policy?.operations.includes(operation)
      ),
      recreating: Boolean(client && !policy),
      createsPermissions: !policy,
      allowedCategories:
        policy?.allowedCategories.map((c) => c.key) ??
        (userId
          ? (
              await this.prisma.client.memoryCategory.findMany({
                select: { key: true }
              })
            ).map((category) => category.key)
          : []),
      deniedCategories: policy?.deniedCategories.map((c) => c.key) ?? [],
      requiresConfirmation: policy?.requiresConfirmation ?? false,
      expiresAt: policy?.expiresAt?.toISOString() ?? null,
      maxSensitivity: policy?.maxSensitivity ?? defaultConnectorMaxSensitivity()
    };
  }

  async approve(input: ConsentDecisionInput) {
    const request = await this.loadPendingRequest(input.requestId, input.nonce);
    const code = createOAuthAuthorizationCode();

    await this.prisma.client
      .$transaction(async (tx) => {
        const client = await this.ensureGrantClient(tx, {
          userId: input.userId,
          registrationId: request.registrationId,
          registrationName: request.registration.name,
          registrationClientId: request.registration.clientId
        });

        await this.ensureGrantPolicy(tx, {
          userId: input.userId,
          clientId: client.id,
          clientName: client.name,
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
      })
      .catch((error) => {
        if (isPrismaError(error, "P2002")) {
          throw new ConflictException(
            "This app’s permissions changed during approval. Start the connection again."
          );
        }
        throw error;
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
    const existing = await consentClient(
      tx,
      input.userId,
      input.registrationId
    );
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
    input: {
      userId: string;
      clientId: string;
      clientName: string;
      scopes: string[];
    }
  ) {
    const operations = scopesToOperations(input.scopes);
    const existing = await tx.policy.findUnique({
      where: {
        userId: input.userId,
        clientId: input.clientId
      },
      select: { id: true, operations: true }
    });

    if (existing) {
      const merged = resultingOperations(existing.operations, input.scopes);

      if (merged.length !== existing.operations.length) {
        await tx.policy.update({
          where: { id: existing.id },
          data: { operations: merged }
        });
        await this.auditService.createAuditEvent(tx, {
          userId: input.userId,
          clientId: input.clientId,
          type: AuditEventType.POLICY_UPDATED,
          actorType: AuditActorType.USER,
          actorId: input.userId,
          metadata: {
            policyId: existing.id,
            policyLabel: appPermissionsLabel(input.clientName),
            changedFields: ["operations"],
            previousOperations: existing.operations,
            operations: merged,
            oauthConsent: true
          }
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
        clientId: input.clientId,
        maxSensitivity: defaultConnectorMaxSensitivity(),
        operations,
        requiresConfirmation: false,
        allowedCategoryCount: categories.length,
        policyLabel: appPermissionsLabel(input.clientName),
        oauthGrant: true
      }
    });

    return created;
  }
}
