import type { MemoryRequestReason, Prisma } from "@funes-vault/db";
import { MemoryRequestStatus } from "@funes-vault/db";

/** Invalidate a snapshot only after the caller has locked and verified its owner. */
export function requireFreshReview(
  tx: Prisma.TransactionClient,
  id: string,
  reason: MemoryRequestReason | null = "policy_changed",
  policyVersion?: string | null
) {
  return tx.memoryRequest.update({
    where: { id },
    data: {
      status: MemoryRequestStatus.NEEDS_USER_APPROVAL,
      decisionReason: reason,
      ...(policyVersion !== undefined ? { policyVersion } : {}),
      approvedAt: null,
      approvalExpiresAt: null,
      reviewSnapshot: {}
    }
  });
}
