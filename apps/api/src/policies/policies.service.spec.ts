import {
  createPolicyRequestSchema,
  listPoliciesQuerySchema,
  updatePolicyRequestSchema
} from "@funes-vault/shared";
import { describe, expect, it, vi } from "vitest";

import { createPolicy } from "../../test/factories/index.js";
import { createService } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { CategoriesService } from "../memories/categories.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PoliciesService } from "./policies.service.js";

function createPrismaMock() {
  return mockPrisma({
    policy: {
      findMany: vi.fn().mockResolvedValue([createPolicy()]),
      count: vi.fn().mockResolvedValue(11)
    }
  });
}

describe("privacy: PoliciesService", () => {
  it("paginates current-user policies with category and client summaries", async () => {
    const prismaClient = createPrismaMock();
    const service = await createService(
      PoliciesService,
      [
        { provide: PrismaService, useValue: { client: prismaClient } },
        { provide: AuditTrailService, useValue: {} }
      ],
      [CategoriesService]
    );

    const response = await service.listPolicies(
      "user_1",
      listPoliciesQuerySchema.parse({
        page: "2",
        limit: "5"
      })
    );

    expect(prismaClient.policy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1" },
        orderBy: { updatedAt: "desc" },
        skip: 5,
        take: 5
      })
    );
    expect(prismaClient.policy.count).toHaveBeenCalledWith({
      where: { userId: "user_1" }
    });
    expect(response.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3
    });
    expect(response.items[0]).toEqual(
      expect.objectContaining({
        clientName: "Local Agent",
        allowedCategoryKeys: ["software_development"]
      })
    );
  });

  it("clamps out-of-range policy pages", async () => {
    const prismaClient = createPrismaMock();
    prismaClient.policy.count.mockResolvedValue(26);
    const service = await createService(
      PoliciesService,
      [
        { provide: PrismaService, useValue: { client: prismaClient } },
        { provide: AuditTrailService, useValue: {} }
      ],
      [CategoriesService]
    );

    const response = await service.listPolicies(
      "user_1",
      listPoliciesQuerySchema.parse({
        page: "999",
        limit: "25"
      })
    );

    expect(prismaClient.policy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1" },
        skip: 25,
        take: 25
      })
    );
    expect(response.pagination).toEqual({
      page: 2,
      limit: 25,
      total: 26,
      totalPages: 2
    });
  });

  it("filters policies by client", async () => {
    const prismaClient = createPrismaMock();
    const service = await createService(
      PoliciesService,
      [
        { provide: PrismaService, useValue: { client: prismaClient } },
        { provide: AuditTrailService, useValue: {} }
      ],
      [CategoriesService]
    );

    await service.listPolicies(
      "user_1",
      listPoliciesQuerySchema.parse({ clientId: "client_1" })
    );

    expect(prismaClient.policy.count).toHaveBeenCalledWith({
      where: { userId: "user_1", clientId: "client_1" }
    });
    expect(prismaClient.policy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", clientId: "client_1" }
      })
    );
  });

  it("rejects a second policy for the same client", async () => {
    const prismaClient = {
      client: { findFirst: vi.fn().mockResolvedValue({ id: "client_1" }) },
      $transaction: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("unique constraint"), { code: "P2002" })
        )
    };
    const service = await createService(
      PoliciesService,
      [
        { provide: PrismaService, useValue: { client: prismaClient } },
        { provide: AuditTrailService, useValue: {} }
      ],
      [CategoriesService]
    );

    await expect(
      service.createPolicy(
        "user_1",
        createPolicyRequestSchema.parse({
          clientId: "client_1"
        })
      )
    ).rejects.toThrow("This app already has permissions");
  });

  it("returns page 1 with no items for empty policy lists", async () => {
    const prismaClient = createPrismaMock();
    prismaClient.policy.count.mockResolvedValue(0);
    const service = await createService(
      PoliciesService,
      [
        { provide: PrismaService, useValue: { client: prismaClient } },
        { provide: AuditTrailService, useValue: {} }
      ],
      [CategoriesService]
    );

    const response = await service.listPolicies(
      "user_1",
      listPoliciesQuerySchema.parse({
        page: "3",
        limit: "10"
      })
    );

    expect(prismaClient.policy.findMany).not.toHaveBeenCalled();
    expect(response).toEqual({
      items: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0
      }
    });
  });
});

it("privacy: updates policy restrictions and audits the same transaction, including explicit clears", async () => {
  const prisma = mockPrisma();
  prisma.policy.findFirst.mockResolvedValue(createPolicy());
  prisma.client.findFirst.mockResolvedValue({ id: "replacement-client" });
  prisma.policy.update.mockResolvedValue(
    createPolicy({ clientId: "replacement-client" })
  );
  const audit = { createAuditEvent: vi.fn() };
  const categories = { assertExist: vi.fn() };
  const service = await createService(PoliciesService, [
    { provide: PrismaService, useValue: { client: prisma } },
    { provide: AuditTrailService, useValue: audit },
    { provide: CategoriesService, useValue: categories }
  ]);
  await service.updatePolicy(
    "owner",
    "policy_1",
    updatePolicyRequestSchema.parse({
      maxSensitivity: "LOW",
      operations: ["READ"],
      requiresConfirmation: true,
      expiresAt: null,
      allowedCategoryKeys: [],
      deniedCategoryKeys: ["health", "health"]
    })
  );
  expect(prisma.policy.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "policy_1", userId: "owner" } })
  );
  expect(prisma.client.findFirst).not.toHaveBeenCalled();
  expect(prisma.policy.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        maxSensitivity: "LOW",
        operations: ["READ"],
        requiresConfirmation: true,
        expiresAt: null,
        allowedCategories: { set: [] },
        deniedCategories: { set: [{ key: "health" }] }
      }
    })
  );
  expect(audit.createAuditEvent.mock.calls[0]?.[0]).toBe(prisma);
  expect(audit.createAuditEvent.mock.calls[0]?.[1]).toEqual(
    expect.objectContaining({
      userId: "owner",
      type: "POLICY_UPDATED"
    })
  );
});

it("privacy: rejects moving permissions to another client", () => {
  expect(() =>
    updatePolicyRequestSchema.parse({
      clientId: "foreign",
      operations: ["READ"]
    })
  ).toThrow();
});

it("privacy: deletes only an owned policy and records its app permission label in the same transaction", async () => {
  const prisma = mockPrisma();
  prisma.policy.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(createPolicy());
  const audit = { createAuditEvent: vi.fn() };
  const service = await createService(PoliciesService, [
    { provide: PrismaService, useValue: { client: prisma } },
    { provide: AuditTrailService, useValue: audit },
    { provide: CategoriesService, useValue: {} }
  ]);
  await expect(service.deletePolicy("owner", "foreign")).rejects.toThrow(
    "Policy not found"
  );
  expect(prisma.policy.delete).not.toHaveBeenCalled();
  await service.deletePolicy("owner", "policy_1");
  expect(prisma.policy.findFirst).toHaveBeenLastCalledWith(
    expect.objectContaining({ where: { id: "policy_1", userId: "owner" } })
  );
  expect(audit.createAuditEvent.mock.calls[0]?.[0]).toBe(prisma);
  expect(audit.createAuditEvent.mock.calls[0]?.[1]).toEqual(
    expect.objectContaining({
      userId: "owner",
      type: "POLICY_DELETED",
      metadata: { policyId: "policy_1", policyLabel: "Local Agent permissions" }
    })
  );
});
