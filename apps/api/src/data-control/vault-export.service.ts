import { MemoryStatus, type Prisma } from "@funes-vault/db";
import {
  exportSchemaVersion,
  type ExportVaultQuery
} from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { toAuditEventResponse } from "../audit/audit.service.js";
import { toClientResponse } from "../clients/clients.service.js";
import { toMemoryResponse } from "../memories/memory.mapper.js";
import { toPolicyResponse } from "../policies/policies.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toCategoryDto } from "./import-mappers.js";

const memoryExportInclude = {
  categories: {
    orderBy: { name: "asc" }
  }
} satisfies Prisma.MemoryInclude;
const policyExportInclude = {
  allowedCategories: { orderBy: { name: "asc" } },
  deniedCategories: { orderBy: { name: "asc" } },
  client: { select: { name: true } }
} satisfies Prisma.PolicyInclude;
/**
 * Owns owner-scoped portable export construction.
 * Tenant boundary: every export query is scoped to the authenticated owner.
 * Audit: read-only; omits token hashes and secrets.
 */
@Injectable()
export class VaultExportService {
  constructor(private readonly prisma: PrismaService) {}
  async exportVault(userId: string, input: ExportVaultQuery) {
    const memoryWhere = this.buildMemoryExportWhere(userId, input);

    const [user, categories, memories, clients, policies, auditEvents] =
      await Promise.all([
        this.prisma.client.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, displayName: true }
        }),
        this.prisma.client.memoryCategory.findMany({
          orderBy: { name: "asc" }
        }),
        this.prisma.client.memory.findMany({
          where: memoryWhere,
          include: memoryExportInclude,
          orderBy: { updatedAt: "desc" }
        }),
        this.prisma.client.client.findMany({
          where: { userId },
          include: { _count: { select: { policies: true } } },
          orderBy: { updatedAt: "desc" }
        }),
        this.prisma.client.policy.findMany({
          where: { userId },
          include: policyExportInclude,
          orderBy: { updatedAt: "desc" }
        }),
        input.includeAuditEvents
          ? this.prisma.client.auditEvent.findMany({
              where: { userId },
              include: {
                client: { select: { name: true } },
                subjects: { orderBy: { createdAt: "asc" } }
              },
              orderBy: { createdAt: "desc" }
            })
          : Promise.resolve([])
      ]);

    const processing = {
      runs: await this.prisma.client.memoryExtractionRun.findMany({
        where: { userId },
        include: { applications: true }
      }),
      consents: await this.prisma.client.processingConsent.findMany({
        where: { userId }
      }),
      providerPreferences:
        await this.prisma.client.processingProviderPreference.findMany({
          where: { userId }
        })
    };
    const exportedCategoryKeys = new Set(
      memories.flatMap((memory) =>
        memory.categories.map((category) => category.key)
      )
    );
    const selectedCategories =
      input.categoryKeys?.length ||
      input.sensitivity ||
      input.createdAfter ||
      input.createdBefore
        ? categories.filter((category) =>
            exportedCategoryKeys.has(category.key)
          )
        : categories;

    return {
      export: {
        ...(!input.categoryKeys?.length &&
        !input.sensitivity &&
        !input.createdAfter &&
        !input.createdBefore
          ? { processing }
          : {}),
        metadata: {
          schemaVersion: exportSchemaVersion,
          exportedAt: new Date().toISOString(),
          source: {
            app: "funes-vault" as const,
            userId,
            email: user?.email ?? null,
            displayName: user?.displayName ?? null
          },
          filters: {
            categoryKeys: input.categoryKeys ?? [],
            sensitivity: input.sensitivity ?? null,
            createdAfter: input.createdAfter ?? null,
            createdBefore: input.createdBefore ?? null,
            includeAuditEvents: input.includeAuditEvents
          }
        },
        categories: selectedCategories.map(toCategoryDto),
        memories: memories.map(toMemoryResponse),
        clients: clients.map((client) => ({
          ...toClientResponse({ ...client, tokenHash: null }),
          hasToken: false
        })),
        policies: policies.map(toPolicyResponse),
        ...(input.includeAuditEvents
          ? { auditEvents: auditEvents.map(toAuditEventResponse) }
          : {})
      }
    };
  }

  buildMemoryExportWhere(userId: string, query: ExportVaultQuery) {
    const excludedStatuses = query.includeArchived
      ? [MemoryStatus.DELETED]
      : [MemoryStatus.DELETED, MemoryStatus.ARCHIVED];
    const where: Prisma.MemoryWhereInput = {
      userId,
      status: { notIn: excludedStatuses }
    };

    if (query.categoryKeys?.length) {
      where.categories = { some: { key: { in: query.categoryKeys } } };
    }

    if (query.sensitivity) {
      where.sensitivity = query.sensitivity;
    }

    if (query.createdAfter || query.createdBefore) {
      where.createdAt = {
        ...(query.createdAfter ? { gte: new Date(query.createdAfter) } : {}),
        ...(query.createdBefore ? { lte: new Date(query.createdBefore) } : {})
      };
    }

    return where;
  }
}
