import {
  listClientOptionsQuerySchema,
  listClientsQuerySchema
} from "@funes-vault/shared";
import { describe, expect, it, vi } from "vitest";

import { createClient } from "../../test/factories/index.js";
import { createService } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { OAuthTokensService } from "../oauth/oauth-tokens.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ClientsService } from "./clients.service.js";

function createPrismaMock() {
  return mockPrisma({
    client: {
      findMany: vi.fn().mockResolvedValue([createClient()]),
      count: vi.fn().mockResolvedValue(12)
    }
  });
}

describe("privacy: ClientsService", () => {
  it("paginates current-user clients without exposing token hashes", async () => {
    const prismaClient = createPrismaMock();
    const service = await createService(ClientsService, [
      { provide: PrismaService, useValue: { client: prismaClient } },
      { provide: AuditTrailService, useValue: {} },
      { provide: OAuthTokensService, useValue: {} }
    ]);

    const response = await service.listClients(
      "user_1",
      listClientsQuerySchema.parse({
        page: "2",
        limit: "10"
      })
    );

    expect(prismaClient.client.findMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      include: {
        _count: { select: { policies: true } },
        policies: {
          where: {
            userId: "user_1"
          },
          select: {
            maxSensitivity: true,
            expiresAt: true,
            requiresConfirmation: true,
            allowedCategories: { select: { key: true } }
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      skip: 10,
      take: 10
    });
    expect(prismaClient.client.count).toHaveBeenCalledWith({
      where: { userId: "user_1" }
    });
    expect(response.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 12,
      totalPages: 2
    });
    expect(response.items[0]).toEqual(
      expect.not.objectContaining({ tokenHash: "token_hash" })
    );
    expect(response.items[0]).toEqual(
      expect.objectContaining({ hasPolicy: true })
    );
  });

  it("clamps out-of-range client pages", async () => {
    const prismaClient = createPrismaMock();
    prismaClient.client.count.mockResolvedValue(26);
    const service = await createService(ClientsService, [
      { provide: PrismaService, useValue: { client: prismaClient } },
      { provide: AuditTrailService, useValue: {} },
      { provide: OAuthTokensService, useValue: {} }
    ]);

    const response = await service.listClients(
      "user_1",
      listClientsQuerySchema.parse({
        page: "999",
        limit: "25"
      })
    );

    expect(prismaClient.client.findMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      include: {
        _count: { select: { policies: true } },
        policies: {
          where: {
            userId: "user_1"
          },
          select: {
            maxSensitivity: true,
            expiresAt: true,
            requiresConfirmation: true,
            allowedCategories: { select: { key: true } }
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      skip: 25,
      take: 25
    });
    expect(response.pagination).toEqual({
      page: 2,
      limit: 25,
      total: 26,
      totalPages: 2
    });
  });

  it("returns page 1 with no items for empty client lists", async () => {
    const prismaClient = createPrismaMock();
    prismaClient.client.count.mockResolvedValue(0);
    const service = await createService(ClientsService, [
      { provide: PrismaService, useValue: { client: prismaClient } },
      { provide: AuditTrailService, useValue: {} },
      { provide: OAuthTokensService, useValue: {} }
    ]);

    const response = await service.listClients(
      "user_1",
      listClientsQuerySchema.parse({
        page: "9",
        limit: "10"
      })
    );

    expect(prismaClient.client.findMany).not.toHaveBeenCalled();
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

  it("lists minimal current-user client options without credential fields", async () => {
    const prismaClient = createPrismaMock();
    const service = await createService(ClientsService, [
      { provide: PrismaService, useValue: { client: prismaClient } },
      { provide: AuditTrailService, useValue: {} },
      { provide: OAuthTokensService, useValue: {} }
    ]);

    const response = await service.listClientOptions(
      "user_1",
      listClientOptionsQuerySchema.parse({
        query: "local"
      })
    );

    expect(prismaClient.client.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        name: { contains: "local", mode: "insensitive" }
      },
      select: {
        id: true,
        name: true,
        type: true,
        trustLevel: true
      },
      orderBy: [{ trustLevel: "asc" }, { name: "asc" }]
    });
    expect(response.items[0]).toEqual({
      id: "client_1",
      name: "Local Agent",
      type: "MCP_CLIENT",
      trustLevel: "APPROVED"
    });
    expect(response.items[0]).toEqual(
      expect.not.objectContaining({
        tokenHash: "token_hash",
        hasToken: true
      })
    );
  });
});

it("returns only the selected display summary, without policy credentials or ownership metadata", async () => {
  const prisma = createPrismaMock();
  prisma.client.findMany.mockResolvedValue([
    createClient({
      policies: [
        {
          maxSensitivity: "LOW",
          requiresConfirmation: true,
          allowedCategories: [{ key: "work" }]
        }
      ]
    })
  ]);
  const service = await createService(ClientsService, [
    { provide: PrismaService, useValue: { client: prisma } },
    { provide: AuditTrailService, useValue: {} },
    { provide: OAuthTokensService, useValue: {} }
  ]);
  const result = await service.listClients("user_1");
  expect(result.items[0]?.policySummary).toEqual({
    expiresAt: null,
    maxSensitivity: "LOW",
    requiresConfirmation: true,
    allowedCategoryKeys: ["work"]
  });
  expect(result.items[0]).not.toHaveProperty("policies");
  expect(result.items[0]).not.toHaveProperty("userId");
});
