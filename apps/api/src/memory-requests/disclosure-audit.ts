import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  type MemoryRequest,
  type Prisma
} from "@funes-vault/db";
import {
  appPermissionsLabel,
  type MemoryRequestReason
} from "@funes-vault/shared";

import type { AuditTrailService } from "../audit-trail/audit-trail.service.js";

/** Persist the owner’s sharing decision in the same transaction as the snapshot. */
export async function recordDisclosureDecision(
  auditTrail: AuditTrailService,
  tx: Prisma.TransactionClient,
  request: MemoryRequest,
  type:
    | typeof AuditEventType.MEMORY_REQUEST_APPROVED
    | typeof AuditEventType.MEMORY_REQUEST_DENIED,
  memoryIds: string[],
  reason: MemoryRequestReason | null = null,
  clientName?: string
) {
  clientName ??= (
    await tx.client.findFirst({
      where: { id: request.clientId, userId: request.userId },
      select: { name: true }
    })
  )?.name;

  return auditTrail.createAuditEvent(tx, {
    userId: request.userId,
    clientId: request.clientId,
    memoryRequestId: request.id,
    type,
    actorType:
      reason === "policy_changed" ? AuditActorType.SYSTEM : AuditActorType.USER,
    actorId: reason === "policy_changed" ? null : request.userId,
    metadata: {
      memoryIds,
      decision:
        type === AuditEventType.MEMORY_REQUEST_APPROVED ? "ALLOW" : "DENY",
      requiresConfirmation: true,
      statedPurpose: request.statedPurpose,
      policyId: request.policyId,
      policyVersion: request.policyVersion,
      reason,
      task: request.task,
      operation: "READ"
    },
    subjects: [
      ...(request.policyId
        ? [
            {
              type: AuditSubjectType.POLICY,
              id: request.policyId,
              role: AuditSubjectRole.POLICY,
              label: appPermissionsLabel(clientName)
            }
          ]
        : []),
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
