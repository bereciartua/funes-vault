import {
  AuditActorType,
  AuditEventType,
  type Policy,
  type Prisma
} from "@funes-vault/db";
import {
  appPermissionsLabel,
  type CreatePolicyRequest,
  isFirstPartyClient,
  type ListPoliciesQuery,
  listPoliciesQuerySchema,
  type UpdatePolicyRequest,
  voiceClientName
} from "@funes-vault/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { buildPagination, paginationSkip } from "../common/pagination.js";
import { isPrismaError } from "../common/prisma-errors.js";
import { toIsoString } from "../common/serialization.js";
import {
  firstPartyCategories,
  type FirstPartyDefinition,
  firstPartyPolicyFacts,
  voiceDefinition,
  webChatDefinition
} from "../first-party-access/first-party-access.service.js";
import { CategoriesService } from "../memories/categories.service.js";
import { toCategoryConnect } from "../memories/memory-update.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { policyInclude } from "./policy.types.js";

type PolicyWithRelations = Policy & {
  allowedCategories: Array<{ key: string }>;
  deniedCategories: Array<{ key: string }>;
  client: { name: string } | null;
};

export function toPolicyResponse(policy: PolicyWithRelations) {
  return {
    id: policy.id,
    clientId: policy.clientId,
    clientName: policy.client?.name ?? null,
    allowedCategoryKeys: policy.allowedCategories.map(
      (category) => category.key
    ),
    deniedCategoryKeys: policy.deniedCategories.map((category) => category.key),
    maxSensitivity: policy.maxSensitivity,
    operations: policy.operations,
    requiresConfirmation: policy.requiresConfirmation,
    expiresAt: toIsoString(policy.expiresAt),
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString()
  };
}

/**
 * Owns owned policy CRUD and referenced-client validation.
 * Tenant boundary: policies and referenced clients must belong to the authenticated user.
 * Audit: policy mutations use AuditTrailService; evaluation itself has no side effects.
 */
@Injectable()
export class PoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditTrailService,
    private readonly categories: CategoriesService
  ) {}

  async restoreDefaults(userId: string, clientId: string) {
    const client = await this.prisma.client.client.findFirst({
      where: { id: clientId, userId }
    });
    if (!client) {
      throw new NotFoundException("App not found");
    }
    if (!isFirstPartyClient(client)) {
      throw new BadRequestException("This app has no first-party defaults");
    }
    const definition =
      client.name === voiceClientName ? voiceDefinition() : webChatDefinition();

    return this.createPolicy(
      userId,
      {
        clientId,
        allowedCategoryKeys: (
          await firstPartyCategories(this.prisma.client)
        ).map((category) => category.key),
        deniedCategoryKeys: [],
        maxSensitivity: definition.maxSensitivity,
        operations: definition.operations,
        requiresConfirmation: definition.requiresConfirmation,
        expiresAt: null
      },
      definition
    );
  }

  async listPolicies(
    userId: string,
    input: ListPoliciesQuery = listPoliciesQuerySchema.parse({})
  ) {
    const where: Prisma.PolicyWhereInput = {
      userId,
      clientId: input.clientId
    };
    const total = await this.prisma.client.policy.count({ where });
    const pagination = buildPagination(input, total);
    const items =
      total === 0
        ? []
        : await this.prisma.client.policy.findMany({
            where,
            include: policyInclude,
            orderBy: { updatedAt: "desc" },
            skip: paginationSkip(pagination),
            take: pagination.limit
          });

    return {
      items: items.map(toPolicyResponse),
      pagination
    };
  }

  async createPolicy(
    userId: string,
    input: CreatePolicyRequest,
    firstPartyDefault?: FirstPartyDefinition
  ) {
    await this.ensureClientBelongsToUser(userId, input.clientId);
    await this.categories.assertExist([
      ...input.allowedCategoryKeys,
      ...input.deniedCategoryKeys
    ]);

    try {
      const policy = await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.policy.create({
          data: {
            userId,
            clientId: input.clientId,
            maxSensitivity: input.maxSensitivity,
            operations: input.operations,
            requiresConfirmation: input.requiresConfirmation,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            allowedCategories: toCategoryConnect(input.allowedCategoryKeys),
            deniedCategories: toCategoryConnect(input.deniedCategoryKeys)
          },
          include: policyInclude
        });

        await this.auditService.createAuditEvent(tx, {
          userId,
          clientId: created.clientId,
          type: AuditEventType.POLICY_CREATED,
          actorType: AuditActorType.USER,
          actorId: userId,
          metadata: {
            policyId: created.id,
            ...(firstPartyDefault
              ? {
                  clientId: created.clientId,
                  ...firstPartyPolicyFacts(
                    firstPartyDefault,
                    input.allowedCategoryKeys.length
                  )
                }
              : {}),
            policyLabel: appPermissionsLabel(created.client?.name)
          }
        });

        return created;
      });

      return { policy: toPolicyResponse(policy) };
    } catch (error) {
      throw this.toDuplicatePermissionsError(error);
    }
  }

  async updatePolicy(userId: string, id: string, input: UpdatePolicyRequest) {
    const existing = await this.prisma.client.policy.findFirst({
      where: { id, userId },
      select: { id: true, clientId: true }
    });

    if (!existing) {
      throw new NotFoundException("Policy not found");
    }

    await this.categories.assertExist([
      ...(input.allowedCategoryKeys ?? []),
      ...(input.deniedCategoryKeys ?? [])
    ]);

    const policy = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.policy.update({
        where: { id: existing.id },
        data: this.toUpdateData(input),
        include: policyInclude
      });

      await this.auditService.createAuditEvent(tx, {
        userId,
        clientId: updated.clientId,
        type: AuditEventType.POLICY_UPDATED,
        actorType: AuditActorType.USER,
        actorId: userId,
        metadata: {
          policyId: updated.id,
          policyLabel: appPermissionsLabel(updated.client?.name),
          changedFields: Object.keys(input)
        }
      });

      return updated;
    });

    return { policy: toPolicyResponse(policy) };
  }

  async deletePolicy(userId: string, id: string) {
    const existing = await this.prisma.client.policy.findFirst({
      where: { id, userId },
      include: policyInclude
    });

    if (!existing) {
      throw new NotFoundException("Policy not found");
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.policy.delete({ where: { id: existing.id } });
      await this.auditService.createAuditEvent(tx, {
        userId,
        clientId: existing.clientId,
        type: AuditEventType.POLICY_DELETED,
        actorType: AuditActorType.USER,
        actorId: userId,
        metadata: {
          policyId: existing.id,
          policyLabel: appPermissionsLabel(existing.client?.name)
        }
      });
    });

    return { policy: toPolicyResponse(existing) };
  }

  private toDuplicatePermissionsError(error: unknown) {
    if (isPrismaError(error, "P2002")) {
      return new ConflictException("This app already has permissions");
    }

    return error;
  }

  private async ensureClientBelongsToUser(userId: string, clientId: string) {
    const client = await this.prisma.client.client.findFirst({
      where: { id: clientId, userId },
      select: { id: true }
    });

    if (!client) {
      throw new BadRequestException("Unknown client");
    }
  }

  private toUpdateData(request: UpdatePolicyRequest) {
    const data: Prisma.PolicyUpdateInput = {};

    if (request.maxSensitivity !== undefined) {
      data.maxSensitivity = request.maxSensitivity;
    }
    if (request.operations !== undefined) {
      data.operations = request.operations;
    }
    if (request.requiresConfirmation !== undefined) {
      data.requiresConfirmation = request.requiresConfirmation;
    }
    if (request.expiresAt !== undefined) {
      data.expiresAt = request.expiresAt ? new Date(request.expiresAt) : null;
    }
    if (request.allowedCategoryKeys !== undefined) {
      data.allowedCategories = {
        set: [...new Set(request.allowedCategoryKeys)].map((key) => ({ key }))
      };
    }
    if (request.deniedCategoryKeys !== undefined) {
      data.deniedCategories = {
        set: [...new Set(request.deniedCategoryKeys)].map((key) => ({ key }))
      };
    }

    return data;
  }
}
