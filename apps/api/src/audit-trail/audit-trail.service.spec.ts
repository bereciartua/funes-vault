import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType
} from "@funes-vault/db";
import { describe, expect, it } from "vitest";

import { createAuditEvent } from "../../test/factories/index.js";
import { createService } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditTrailService } from "./audit-trail.service.js";

describe("privacy: audit trail writer", () => {
  it("stores inferred and explicit subjects once with the same owner and event", async () => {
    const prisma = mockPrisma();
    prisma.auditEvent.create.mockResolvedValue(createAuditEvent());
    const service = await createService(AuditTrailService, [
      { provide: PrismaService, useValue: { client: prisma } }
    ]);
    await service.createAuditEvent(prisma, {
      userId: "owner",
      type: AuditEventType.MEMORY_CREATED,
      actorType: AuditActorType.USER,
      actorId: "owner",
      metadata: { memoryId: "memory" },
      subjects: [
        {
          type: AuditSubjectType.MEMORY,
          id: "memory",
          role: AuditSubjectRole.CREATED,
          label: "A memory"
        }
      ]
    });
    const write = prisma.auditEventSubject.createMany.mock.calls[0]?.[0];
    expect(write).toEqual({
      skipDuplicates: true,
      data: [
        {
          userId: "owner",
          auditEventId: "audit_1",
          subjectType: "MEMORY",
          subjectId: "memory",
          role: "CREATED",
          labelSnapshot: "A memory",
          metadata: {}
        }
      ]
    });
  });
  it("does not infer subjects when an event explicitly opts out", async () => {
    const prisma = mockPrisma();
    prisma.auditEvent.create.mockResolvedValue(createAuditEvent());
    const service = await createService(AuditTrailService, [
      { provide: PrismaService, useValue: { client: prisma } }
    ]);
    await service.createAuditEvent(prisma, {
      userId: "owner",
      type: AuditEventType.MEMORY_CREATED,
      actorType: AuditActorType.USER,
      metadata: { memoryId: "memory" },
      inferSubjects: false
    });
    expect(prisma.auditEventSubject.createMany).not.toHaveBeenCalled();
  });
});
