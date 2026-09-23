import { AuditEventType } from "@funes-vault/db";
import { listAuditEventsQuerySchema } from "@funes-vault/shared";
import { describe, expect, it, vi } from "vitest";

import { createAuditEvent } from "../../test/factories/index.js";
import { createService } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "./audit.service.js";

function createPrismaMock() {
  return mockPrisma({
    auditEvent: {
      findMany: vi.fn().mockResolvedValue([createAuditEvent()]),
      count: vi.fn().mockResolvedValue(26),
      findFirst: vi.fn(),
      create: vi.fn()
    }
  });
}

describe("privacy: AuditService", () => {
  it("clamps current-user audit pages with active filters", async () => {
    const prismaClient = createPrismaMock();
    const service = await createService(AuditService, [
      { provide: PrismaService, useValue: { client: prismaClient } }
    ]);

    const response = await service.listEvents(
      "user_1",
      listAuditEventsQuerySchema.parse({
        page: "999",
        limit: "25",
        type: AuditEventType.CLIENT_CREATED,
        clientId: "client_1"
      })
    );

    const where = {
      userId: "user_1",
      type: AuditEventType.CLIENT_CREATED,
      clientId: "client_1"
    };
    expect(prismaClient.auditEvent.count).toHaveBeenCalledWith({ where });
    expect(prismaClient.auditEvent.findMany).toHaveBeenCalledWith({
      where,
      include: {
        client: { select: { name: true } },
        subjects: { orderBy: { createdAt: "asc" } }
      },
      orderBy: { createdAt: "desc" },
      skip: 25,
      take: 25
    });
    expect(response.pagination).toEqual({
      page: 2,
      limit: 25,
      total: 26,
      totalPages: 2
    });
    expect(response.items[0]).toEqual(
      expect.objectContaining({
        id: "audit_1",
        clientName: "Local Agent"
      })
    );
  });

  it("returns a stable empty audit page for empty filtered history", async () => {
    const prismaClient = createPrismaMock();
    prismaClient.auditEvent.count.mockResolvedValue(0);
    const service = await createService(AuditService, [
      { provide: PrismaService, useValue: { client: prismaClient } }
    ]);

    const response = await service.listEvents(
      "user_1",
      listAuditEventsQuerySchema.parse({
        page: "5",
        limit: "10"
      })
    );

    expect(prismaClient.auditEvent.findMany).not.toHaveBeenCalled();
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
