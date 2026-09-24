import {
  AuditActorType,
  AuditEventType,
  PolicyOperation,
  type Prisma
} from "@funes-vault/db";
import { appPermissionsLabel } from "@funes-vault/shared";

import type { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import type { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
export const proposedMemoryId = "proposed_memory";
export function recordSuggestionDenial(
  tx: Prisma.TransactionClient,
  audit: AuditTrailService,
  input: {
    userId: string;
    clientId: string;
    statedPurpose: string | null;
    policy: Awaited<ReturnType<PolicyEvaluationService["evaluateForClient"]>>;
  }
) {
  return audit.createAuditEvent(tx, {
    userId: input.userId,
    clientId: input.clientId,
    type: AuditEventType.MEMORY_SUGGESTION_DENIED,
    actorType: AuditActorType.CLIENT,
    actorId: input.clientId,
    metadata: {
      statedPurpose: input.statedPurpose,
      policyId: input.policy.policyId,
      policyVersion: input.policy.policyVersion,
      policyLabel: appPermissionsLabel(input.policy.client?.name),
      reason: input.policy.reason,
      decision: "DENY",
      operation: PolicyOperation.SUGGEST
    }
  });
}
