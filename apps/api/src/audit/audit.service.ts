import { type Prisma } from "@funes-vault/db";
import { type ListAuditEventsQuery } from "@funes-vault/shared";
import { Injectable, NotFoundException } from "@nestjs/common";

import { toAuditSubjectResponse } from "../audit-trail/audit-subjects.js";
import { buildPagination, paginationSkip } from "../common/pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";

type AuditEventWithClient = Prisma.AuditEventGetPayload<{
  include: {
    client: { select: { name: true } };
    subjects: { orderBy: { createdAt: "asc" } };
  };
}>;

export function toAuditEventResponse(event: AuditEventWithClient) {
  return {
    id: event.id,
    type: event.type,
    actorType: event.actorType,
    actorId: event.actorId,
    clientId: event.clientId,
    clientName: event.client?.name ?? null,
    memoryRequestId: event.memoryRequestId,
    metadata:
      typeof event.metadata === "object" &&
      event.metadata !== null &&
      !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : {},
    subjects: event.subjects.map(toAuditSubjectResponse),
    createdAt: event.createdAt.toISOString()
  };
}

/**
 * Owns audit pagination and response mapping.
 * Tenant boundary: event lookups are scoped to the authenticated userId.
 * Audit: read-only; AuditTrailModule owns event creation.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async listEvents(userId: string, input: ListAuditEventsQuery) {
    const where: Prisma.AuditEventWhereInput = {
      userId,
      type: input.type,
      clientId: input.clientId
    };

    const total = await this.prisma.client.auditEvent.count({ where });
    const pagination = buildPagination(input, total);
    const items =
      total === 0
        ? []
        : await this.prisma.client.auditEvent.findMany({
            where,
            include: {
              client: { select: { name: true } },
              subjects: { orderBy: { createdAt: "asc" } }
            },
            orderBy: { createdAt: "desc" },
            skip: paginationSkip(pagination),
            take: pagination.limit
          });

    await this.fillMemorySubjectLabels(userId, items);

    return {
      items: items.map(toAuditEventResponse),
      pagination
    };
  }

  async getEvent(userId: string, id: string) {
    const event = await this.prisma.client.auditEvent.findFirst({
      where: { id, userId },
      include: {
        client: { select: { name: true } },
        subjects: { orderBy: { createdAt: "asc" } }
      }
    });

    if (!event) {
      throw new NotFoundException("Audit event not found");
    }

    await this.fillMemorySubjectLabels(userId, [event]);

    return { auditEvent: toAuditEventResponse(event) };
  }

  private async fillMemorySubjectLabels(
    userId: string,
    events: AuditEventWithClient[]
  ) {
    const unlabeledMemoryIds = [
      ...new Set(
        events
          .flatMap((event) => event.subjects)
          .filter(
            (subject) =>
              subject.subjectType === "MEMORY" && !subject.labelSnapshot
          )
          .map((subject) => subject.subjectId)
      )
    ];

    if (unlabeledMemoryIds.length === 0) {
      return;
    }

    const memories = await this.prisma.client.memory.findMany({
      where: { id: { in: unlabeledMemoryIds }, userId },
      select: { id: true, title: true }
    });
    const titles = new Map(memories.map((memory) => [memory.id, memory.title]));

    for (const event of events) {
      for (const subject of event.subjects) {
        if (subject.subjectType === "MEMORY" && !subject.labelSnapshot) {
          subject.labelSnapshot = titles.get(subject.subjectId) ?? null;
        }
      }
    }
  }
}
