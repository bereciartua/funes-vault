import {
  ClientTrustLevel,
  MemoryKind,
  MemorySensitivity,
  MemoryStatus,
  PolicyOperation,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { fillDailySeries, OverviewService } from "./overview.service.js";

const now = new Date("2026-07-08T12:00:00.000Z");

function createMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: "memory_secret",
    userId: "user_1",
    kind: MemoryKind.FACT,
    title: "Sensitive deployment context",
    body: "The user has a sensitive deployment note.",
    sensitivity: MemorySensitivity.SECRET,
    confidence: 0.9,
    status: MemoryStatus.ACTIVE,
    reviewState: ReviewState.APPROVED,
    sourceType: SourceType.MANUAL,
    sourceClientId: null,
    sourceUri: null,
    sourceMetadata: {},
    lastConfirmedAt: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    categories: [],
    ...overrides
  };
}

function createPolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: "policy_1",
    userId: "user_1",
    clientId: "client_1",

    maxSensitivity: MemorySensitivity.INTERNAL,
    operations: [PolicyOperation.READ],
    requiresConfirmation: true,
    expiresAt: now,
    createdAt: now,
    updatedAt: now,
    allowedCategories: [{ key: "software_development" }],
    deniedCategories: [],
    client: { name: "Local Agent" },
    ...overrides
  };
}

function createPrismaMock() {
  return {
    memory: {
      count: vi.fn().mockResolvedValue(123),
      groupBy: vi.fn().mockResolvedValue([
        { sensitivity: MemorySensitivity.LOW, _count: { _all: 100 } },
        { sensitivity: MemorySensitivity.SECRET, _count: { _all: 23 } }
      ]),
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(createMemory())
        .mockResolvedValueOnce({ createdAt: now })
    },
    client: mockPrisma({
      count: vi.fn().mockResolvedValue(7),
      groupBy: vi.fn().mockResolvedValue([
        { trustLevel: ClientTrustLevel.APPROVED, _count: { _all: 5 } },
        { trustLevel: ClientTrustLevel.UNKNOWN, _count: { _all: 2 } }
      ])
    }),
    memoryCategory: {
      count: vi.fn().mockResolvedValue(6)
    },
    policy: {
      findMany: vi.fn().mockResolvedValue([
        createPolicy(),
        createPolicy({
          id: "policy_export",
          maxSensitivity: MemorySensitivity.SECRET,
          operations: [PolicyOperation.READ, PolicyOperation.EXPORT],
          requiresConfirmation: false,
          expiresAt: null,
          updatedAt: new Date("2026-07-08T12:10:00.000Z"),
          allowedCategories: []
        })
      ])
    },
    memorySuggestion: {
      count: vi.fn().mockResolvedValue(9),
      findFirst: vi.fn().mockResolvedValue({
        createdAt: new Date("2026-07-01T10:00:00.000Z")
      })
    },
    $queryRaw: vi
      .fn()
      .mockResolvedValue([
        { day: new Date("2026-07-08T00:00:00.000Z"), count: 3n }
      ])
  };
}

describe("OverviewService", () => {
  let prismaClient: ReturnType<typeof createPrismaMock>;
  let auditService: { listEvents: ReturnType<typeof vi.fn> };
  let service: OverviewService;

  beforeEach(async () => {
    prismaClient = createPrismaMock();
    auditService = {
      listEvents: vi.fn().mockResolvedValue({
        items: [{ id: "audit_1" }],
        pagination: { page: 1, limit: 6, total: 42, totalPages: 7 }
      })
    };
    service = await createService(OverviewService, [
      { provide: PrismaService, useValue: { client: prismaClient } },
      { provide: AuditService, useValue: auditService }
    ]);
  });

  it("returns aggregate overview counts without list truncation", async () => {
    const overview = await service.getOverview("user_1");

    expect(prismaClient.memory.count).toHaveBeenCalledWith({
      where: { userId: "user_1", status: MemoryStatus.ACTIVE }
    });
    expect(prismaClient.memory.groupBy).toHaveBeenCalledWith({
      by: ["sensitivity"],
      where: { userId: "user_1", status: MemoryStatus.ACTIVE },
      _count: { _all: true }
    });
    expect(auditService.listEvents).toHaveBeenCalledWith("user_1", {
      page: 1,
      limit: 6
    });
    expect(overview.memoryTotal).toBe(123);
    expect(overview.memorySensitivityCounts).toContainEqual({
      sensitivity: MemorySensitivity.SECRET,
      count: 23
    });
    expect(overview.clientTrustCounts).toContainEqual({
      trustLevel: ClientTrustLevel.BLOCKED,
      count: 0
    });
    expect(overview.suggestionTotal).toBe(9);
    expect(overview.oldestPendingSuggestionAt).toBe("2026-07-01T10:00:00.000Z");
    expect(overview.captureSeries).toHaveLength(30);
    expect(overview.captureSeries.at(-1)).toEqual({
      date: expect.any(String),
      count: expect.any(Number)
    });
    expect(overview.lastCapturedAt).toBe(now.toISOString());
    expect(overview.broadestPolicy?.id).toBe("policy_export");
    expect(overview.auditTotal).toBe(42);
    expect(overview.recentAuditEvents).toEqual([{ id: "audit_1" }]);
  });

  it.each(["WEB_APP", "MCP_CLIENT"])(
    "identifies first-party permissions by name and type: %s",
    async (type) => {
      prismaClient.policy.findMany.mockResolvedValue([
        createPolicy({ client: { name: "Funes Vault Web Chat", type } })
      ]);
      expect(
        (await service.getOverview("user_1")).broadestPolicy?.firstParty
      ).toBe(type === "WEB_APP");
    }
  );

  it("zero-fills UTC capture days and excludes rows outside the window", () => {
    const series = fillDailySeries(
      [
        { day: new Date("2026-06-08T00:00:00.000Z"), count: 99n },
        { day: new Date("2026-07-07T00:00:00.000Z"), count: 2n }
      ],
      30,
      now
    );

    expect(series).toHaveLength(30);
    expect(series[0]).toEqual({ date: "2026-06-09", count: 0 });
    expect(series.at(-2)).toEqual({ date: "2026-07-07", count: 2 });
    expect(series.at(-1)).toEqual({ date: "2026-07-08", count: 0 });
  });
});
