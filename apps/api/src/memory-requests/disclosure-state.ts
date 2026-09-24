import type { Prisma } from "@funes-vault/db";
import { MemoryRequestStatus } from "@funes-vault/db";

/** Invalidate a snapshot only after the caller has locked and verified its owner. */
export function requireFreshReview(tx: Prisma.TransactionClient, id: string) {
  return tx.memoryRequest.update({
    where: { id },
    data: {
      status: MemoryRequestStatus.NEEDS_USER_APPROVAL,
      decisionReason: "policy_changed",
      approvedAt: null,
      approvalExpiresAt: null,
      reviewSnapshot: {}
    }
  });
}
