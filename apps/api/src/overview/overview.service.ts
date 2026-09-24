import {
  ClientTrustLevel,
  MemorySensitivity,
  MemoryStatus,
  MemorySuggestionStatus,
  Prisma
} from "@funes-vault/db";
import { isFirstPartyClient, policyRiskFactors } from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { toMemoryResponse } from "../memories/memory.mapper.js";
import { memoryInclude } from "../memories/memory.types.js";
import { toPolicyResponse } from "../policies/policies.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const overviewPolicyInclude = {
  allowedCategories: { orderBy: { name: "asc" } },
  deniedCategories: { orderBy: { name: "asc" } },
  client: { select: { name: true, type: true } }
} satisfies Prisma.PolicyInclude;

type PolicyWithRelations = Prisma.PolicyGetPayload<{
  include: typeof overviewPolicyInclude;
}>;

const memorySensitivities = Object.values(MemorySensitivity);
const clientTrustLevels = Object.values(ClientTrustLevel);
const highSensitivityLevels = new Set<MemorySensitivity>([
  MemorySensitivity.SENSITIVE,
  MemorySensitivity.RESTRICTED,
  MemorySensitivity.SECRET
]);

type CaptureRow = { day: Date; count: bigint | number };

function utcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** @internal */
export function fillDailySeries(
  rows: CaptureRow[],
  days: number,
  todayUtc: Date
) {
  const counts = new Map(
    rows.map((row) => [utcDateKey(new Date(row.day)), Number(row.count)])
  );
  const today = new Date(
    Date.UTC(
      todayUtc.getUTCFullYear(),
      todayUtc.getUTCMonth(),
      todayUtc.getUTCDate()
    )
  );

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - index - 1));
    const key = utcDateKey(date);

    return { date: key, count: counts.get(key) ?? 0 };
  });
}

/**
 * Owns aggregated dashboard metrics and activity.
 * Tenant boundary: all aggregates and recent activity are scoped to the current userId.
 * Audit: read-only; no audit or provenance writes.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async getOverview(userId: string) {
    const [
      memoryTotal,
      memorySensitivityRows,
      recentHighSensitivityMemory,
      clientTotal,
      clientTrustRows,
      categoryTotal,
      policies,
      suggestionTotal,
      oldestPendingSuggestion,
      captureRows,
      lastCapturedMemory,
      recentAudit
    ] = await Promise.all([
      this.prisma.client.memory.count({
        where: { userId, status: MemoryStatus.ACTIVE }
      }),
      this.prisma.client.memory.groupBy({
        by: ["sensitivity"],
        where: { userId, status: MemoryStatus.ACTIVE },
        _count: { _all: true }
      }),
      this.prisma.client.memory.findFirst({
        where: {
          userId,
          status: MemoryStatus.ACTIVE,
          sensitivity: { in: [...highSensitivityLevels] }
        },
        include: memoryInclude,
        orderBy: { updatedAt: "desc" }
      }),
      this.prisma.client.client.count({ where: { userId } }),
      this.prisma.client.client.groupBy({
        by: ["trustLevel"],
        where: { userId },
        _count: { _all: true }
      }),
      this.prisma.client.memoryCategory.count(),
      this.prisma.client.policy.findMany({
        where: { userId },
        include: overviewPolicyInclude
      }),
      this.prisma.client.memorySuggestion.count({
        where: { userId, status: MemorySuggestionStatus.QUEUED_FOR_REVIEW }
      }),
      this.prisma.client.memorySuggestion.findFirst({
        where: { userId, status: MemorySuggestionStatus.QUEUED_FOR_REVIEW },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true }
      }),
      this.prisma.client.$queryRaw<CaptureRow[]>(Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
        FROM "Memory"
        WHERE "userId" = ${userId}
          AND "status" = 'ACTIVE'
          AND "createdAt" >= (date_trunc('day', now() AT TIME ZONE 'UTC') - interval '29 days')
        GROUP BY 1
        ORDER BY 1
      `),
      this.prisma.client.memory.findFirst({
        where: { userId, status: MemoryStatus.ACTIVE },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
      }),
      this.auditService.listEvents(userId, { page: 1, limit: 6 })
    ]);
    const broadestPolicy = this.broadestPolicy(policies, categoryTotal);

    return {
      memoryTotal,
      memorySensitivityCounts: memorySensitivities.map((sensitivity) => ({
        sensitivity,
        count:
          memorySensitivityRows.find((row) => row.sensitivity === sensitivity)
            ?._count._all ?? 0
      })),
      recentHighSensitivityMemory: recentHighSensitivityMemory
        ? toMemoryResponse(recentHighSensitivityMemory)
        : null,
      clientTotal,
      clientTrustCounts: clientTrustLevels.map((trustLevel) => ({
        trustLevel,
        count:
          clientTrustRows.find((row) => row.trustLevel === trustLevel)?._count
            ._all ?? 0
      })),
      policyTotal: policies.length,
      categoryTotal,
      broadestPolicy: broadestPolicy
        ? {
            ...toPolicyResponse(broadestPolicy),
            firstParty: isFirstPartyClient(broadestPolicy.client)
          }
        : null,
      suggestionTotal,
      oldestPendingSuggestionAt:
        oldestPendingSuggestion?.createdAt.toISOString() ?? null,
      captureSeries: fillDailySeries(captureRows, 30, new Date()),
      lastCapturedAt: lastCapturedMemory?.createdAt.toISOString() ?? null,
      auditTotal: recentAudit.pagination.total,
      recentAuditEvents: recentAudit.items
    };
  }

  private broadestPolicy(
    policies: PolicyWithRelations[],
    categoryTotal: number
  ) {
    return [...policies].sort((left, right) => {
      const riskDelta =
        this.policyRiskScore(right, categoryTotal) -
        this.policyRiskScore(left, categoryTotal);

      if (riskDelta !== 0) {
        return riskDelta;
      }

      return right.updatedAt.getTime() - left.updatedAt.getTime();
    })[0];
  }

  private policyRiskScore(policy: PolicyWithRelations, categoryTotal: number) {
    const riskScores = {
      SENSITIVE_ALLOWED: 10,
      RESTRICTED_ALLOWED: 10,
      SECRET_ALLOWED: 100,
      ALL_CATEGORIES: 10,
      MANY_CATEGORIES: 10,
      NO_CONFIRMATION: 10,
      NO_EXPIRATION: 1,
      WRITE_ALLOWED: 100,
      EXPORT_ALLOWED: 100
    };

    return policyRiskFactors(
      {
        allowedCategoryCount: policy.allowedCategories.length,
        maxSensitivity: policy.maxSensitivity,
        operations: policy.operations,
        requiresConfirmation: policy.requiresConfirmation,
        expiresAt: policy.expiresAt
      },
      categoryTotal
    ).reduce((score, factor) => score + riskScores[factor], 0);
  }
}
