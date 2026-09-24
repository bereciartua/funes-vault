import {
  AuditActorType,
  AuditEventType,
  type Client,
  ClientTrustLevel,
  type Prisma
} from "@funes-vault/db";
import {
  type CreateClientRequest,
  type ListClientOptionsQuery,
  listClientOptionsQuerySchema,
  type ListClientsQuery,
  listClientsQuerySchema,
  type UpdateClientRequest
} from "@funes-vault/shared";
import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { buildPagination, paginationSkip } from "../common/pagination.js";
import { isPrismaError } from "../common/prisma-errors.js";
import { toIsoString } from "../common/serialization.js";
import { OAuthTokensService } from "../oauth/oauth-tokens.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { createClientToken, hashToken } from "./client-token.js";

export function toClientResponse(
  client: Client & { _count?: { policies: number } }
) {
  return {
    id: client.id,
    name: client.name,
    type: client.type,
    trustLevel: client.trustLevel,
    declaredRetention: client.declaredRetention,
    hasToken: Boolean(client.tokenHash),
    hasPolicy: (client._count?.policies ?? 0) > 0,
    oauthConnector: Boolean(client.oauthRegistrationId),
    lastUsedAt: toIsoString(client.lastUsedAt),
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString()
  };
}

const policyCountInclude = {
  _count: { select: { policies: true } }
} satisfies Prisma.ClientInclude;

function toClientOption(
  client: Pick<Client, "id" | "name" | "type" | "trustLevel">
) {
  return {
    id: client.id,
    name: client.name,
    type: client.type,
    trustLevel: client.trustLevel
  };
}

/**
 * Owns client CRUD and token rotation.
 * Tenant boundary: authenticated userId scopes every client lookup.
 * Audit: client changes are recorded through AuditTrailService; token hashes never leave responses.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditTrailService,
    private readonly oauthTokens: OAuthTokensService
  ) {}

  async listClients(
    userId: string,
    input: ListClientsQuery = listClientsQuerySchema.parse({})
  ) {
    const where: Prisma.ClientWhereInput = { userId };
    const total = await this.prisma.client.client.count({ where });
    const pagination = buildPagination(input, total);
    const items =
      total === 0
        ? []
        : await this.prisma.client.client.findMany({
            where,
            include: {
              ...policyCountInclude,
              policies: {
                where: {
                  userId,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
                },
                orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
                take: 1,
                select: {
                  maxSensitivity: true,
                  requiresConfirmation: true,
                  allowedCategories: { select: { key: true } }
                }
              }
            },
            orderBy: { updatedAt: "desc" },
            skip: paginationSkip(pagination),
            take: pagination.limit
          });

    return {
      items: items.map((client) => ({
        ...toClientResponse(client),
        policySummary: client.policies?.[0]
          ? {
              maxSensitivity: client.policies[0].maxSensitivity,
              requiresConfirmation: client.policies[0].requiresConfirmation,
              allowedCategoryKeys: client.policies[0].allowedCategories.map(
                (category) => category.key
              )
            }
          : null
      })),
      pagination
    };
  }

  async listClientOptions(
    userId: string,
    input: ListClientOptionsQuery = listClientOptionsQuerySchema.parse({})
  ) {
    const where: Prisma.ClientWhereInput = {
      userId,
      name: input.query
        ? { contains: input.query, mode: "insensitive" }
        : undefined
    };
    const items = await this.prisma.client.client.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        trustLevel: true
      },
      orderBy: [{ trustLevel: "asc" }, { name: "asc" }]
    });

    return { items: items.map(toClientOption) };
  }

  async createClient(userId: string, input: CreateClientRequest) {
    const token = createClientToken();

    try {
      const client = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            userId,
            name: input.name,
            type: input.type,
            trustLevel: input.trustLevel,
            declaredRetention: input.declaredRetention,
            tokenHash: hashToken(token)
          }
        });

        await this.auditService.createAuditEvent(tx, {
          userId,
          clientId: created.id,
          type: AuditEventType.CLIENT_CREATED,
          actorType: AuditActorType.USER,
          actorId: userId,
          metadata: {
            clientId: created.id,
            clientName: created.name,
            trustLevel: created.trustLevel
          }
        });

        return created;
      });

      return { client: toClientResponse(client), token };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("A client with this name already exists");
      }

      throw error;
    }
  }

  async updateClient(userId: string, id: string, input: UpdateClientRequest) {
    const existing = await this.prisma.client.client.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      throw new NotFoundException("Client not found");
    }

    const token = input.rotateToken ? createClientToken() : undefined;

    try {
      const client = await this.prisma.client.$transaction(async (tx) => {
        const updated = await tx.client.update({
          where: { id: existing.id },
          data: this.toUpdateData(input, token),
          include: policyCountInclude
        });

        // Blocking an OAuth connector grant cuts off its issued tokens too;
        // otherwise access tokens would keep working until they expire.
        if (
          existing.oauthRegistrationId &&
          input.trustLevel === ClientTrustLevel.BLOCKED &&
          existing.trustLevel !== ClientTrustLevel.BLOCKED
        ) {
          await this.oauthTokens.revokeTokensForClient(
            existing.id,
            "grant_blocked",
            { actorType: AuditActorType.USER, actorId: userId },
            tx
          );
        }

        await this.auditService.createAuditEvent(tx, {
          userId,
          clientId: updated.id,
          type: input.rotateToken
            ? AuditEventType.CLIENT_TOKEN_ROTATED
            : AuditEventType.CLIENT_UPDATED,
          actorType: AuditActorType.USER,
          actorId: userId,
          metadata: {
            clientId: updated.id,
            changedFields: Object.keys(input).filter(
              (field) => field !== "rotateToken"
            ),
            rotatedToken: Boolean(input.rotateToken)
          }
        });

        return updated;
      });

      return token
        ? { client: toClientResponse(client), token }
        : { client: toClientResponse(client) };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("A client with this name already exists");
      }

      throw error;
    }
  }

  async deleteClient(userId: string, id: string) {
    const existing = await this.prisma.client.client.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      throw new NotFoundException("Client not found");
    }

    await this.prisma.client.$transaction(async (tx) => {
      // Deleting the grant cascades its OAuth tokens away; revoke first so
      // the cutoff itself is audited.
      if (existing.oauthRegistrationId) {
        await this.oauthTokens.revokeTokensForClient(
          existing.id,
          "grant_revoked",
          { actorType: AuditActorType.USER, actorId: userId },
          tx
        );
      }

      await tx.client.delete({ where: { id: existing.id } });
      await this.auditService.createAuditEvent(tx, {
        userId,
        clientId: null,
        type: AuditEventType.CLIENT_UPDATED,
        actorType: AuditActorType.USER,
        actorId: userId,
        metadata: {
          clientId: existing.id,
          clientName: existing.name,
          deleted: true
        }
      });
    });

    return { client: toClientResponse({ ...existing, tokenHash: null }) };
  }

  private toUpdateData(
    request: UpdateClientRequest,
    token: string | undefined
  ) {
    const data: Prisma.ClientUpdateInput = {};

    if (request.name !== undefined) {
      data.name = request.name;
    }
    if (request.type !== undefined) {
      data.type = request.type;
    }
    if (request.trustLevel !== undefined) {
      data.trustLevel = request.trustLevel;
    }
    if (request.declaredRetention !== undefined) {
      data.declaredRetention = request.declaredRetention;
    }
    if (token) {
      data.tokenHash = hashToken(token);
    }

    return data;
  }

  private isUniqueConstraintError(error: unknown) {
    return isPrismaError(error, "P2002");
  }
}
