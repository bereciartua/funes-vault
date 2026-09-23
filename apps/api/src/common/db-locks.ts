import { Prisma } from "@funes-vault/db";

/** Serialize owner-scoped writes; callers must already have authenticated the owner. */
export async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

/** Deterministic ordering avoids deadlocks when two operations lock the same set. */
export async function lockMemories(
  tx: Prisma.TransactionClient,
  userId: string,
  ids: string[]
) {
  if (!ids.length) {
    return;
  }
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "Memory" WHERE "userId" = ${userId} AND id IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY id FOR UPDATE`
  );
}
