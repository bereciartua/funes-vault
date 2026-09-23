import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

export { PrismaClient };
export * from "./generated/prisma/client.js";

export function createPrismaClient(
  connectionString = process.env.DATABASE_URL
): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a Prisma client");
  }
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}
