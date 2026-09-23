import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  type MemoryRequest,
  type Prisma
} from "@funes-vault/db";

import type { AuditTrailService } from "../audit-trail/audit-trail.service.js";

/** Persist the owner’s sharing decision in the same transaction as the snapshot. */
export function recordDisclosureDecision(
  auditTrail: AuditTrailService,
  tx: Prisma.TransactionClient,
  request: MemoryRequest,
  type:
    | typeof AuditEventType.MEMORY_REQUEST_APPROVED
    | typeof AuditEventType.MEMORY_REQUEST_DENIED,
  memoryIds: string[]
) {
  return auditTrail.createAuditEvent(tx, {
    userId: request.userId,
    clientId: request.clientId,
    memoryRequestId: request.id,
    type,
    actorType: AuditActorType.USER,
    actorId: request.userId,
    metadata: { memoryIds, purpose: request.purpose },
    subjects: [
      {
        type: AuditSubjectType.MEMORY_REQUEST,
        id: request.id,
        role: AuditSubjectRole.REQUEST
      },
      {
        type: AuditSubjectType.CLIENT,
        id: request.clientId,
        role: AuditSubjectRole.CLIENT
      }
    ]
  });
}
