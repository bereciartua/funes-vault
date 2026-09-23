import type { Prisma } from "@funes-vault/db";
export const policyInclude = {
  allowedCategories: { orderBy: { name: "asc" } },
  deniedCategories: { orderBy: { name: "asc" } },
  client: { select: { name: true } }
} satisfies Prisma.PolicyInclude;
