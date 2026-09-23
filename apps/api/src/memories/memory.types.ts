import type { Memory, MemoryCategory, Prisma } from "@funes-vault/db";

export type MemoryWithCategories = Memory & {
  categories: MemoryCategory[];
};

export const memoryInclude = {
  categories: {
    orderBy: { name: "asc" }
  }
} satisfies Prisma.MemoryInclude;

export const memorySnapshotSelect = {
  id: true,
  title: true,
  status: true,
  reviewState: true,
  sourceType: true,
  sourceClientId: true,
  sourceUri: true,
  sourceMetadata: true
} satisfies Prisma.MemorySelect;

export const categoryPromptSelect = {
  key: true,
  name: true,
  description: true
} satisfies Prisma.MemoryCategorySelect;
