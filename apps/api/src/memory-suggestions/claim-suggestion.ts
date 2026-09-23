import { MemorySuggestionStatus, type Prisma } from "@funes-vault/db";
import { ConflictException } from "@nestjs/common";

import { lockUser } from "../common/db-locks.js";

/** Claim exactly once inside the mutation transaction, in the common owner-first lock order. */
export async function claimSuggestion(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
  status:
    | typeof MemorySuggestionStatus.APPLIED
    | typeof MemorySuggestionStatus.REJECTED
) {
  await lockUser(tx, userId);
  const claim = await tx.memorySuggestion.updateMany({
    where: { id, userId, status: MemorySuggestionStatus.QUEUED_FOR_REVIEW },
    data: { status }
  });
  if (claim.count !== 1) {
    throw new ConflictException("Memory suggestion is not reviewable");
  }
}
