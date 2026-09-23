import { createPrismaClient, type PrismaClient } from "@funes-vault/db";
import { defaultMemoryCategories } from "@funes-vault/shared/domain";

export function getTestDatabaseUrl() {
  const databaseUrl = process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for database-backed tests");
  }

  if (!new URL(databaseUrl).pathname.endsWith("_test")) {
    throw new Error("Database-backed tests require a database ending in _test");
  }

  return databaseUrl;
}

export function createTestPrismaClient() {
  return createPrismaClient(getTestDatabaseUrl());
}

export async function resetTestDatabase(prisma: PrismaClient) {
  getTestDatabaseUrl();
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
  `;
  const identifiers = tables.map(
    ({ table_name }) => `"public"."${table_name.replaceAll('"', '""')}"`
  );
  await prisma.$transaction(async (tx) => {
    if (identifiers.length) {
      // Identifiers come only from Postgres metadata and are quoted, never from a request.
      await tx.$executeRawUnsafe(
        `TRUNCATE TABLE ${identifiers.join(", ")} RESTART IDENTITY CASCADE`
      );
    }
    await tx.memoryCategory.createMany({ data: [...defaultMemoryCategories] });
  });
}
