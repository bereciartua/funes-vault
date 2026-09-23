import {
  type MemoryCategory,
  MemoryStatus,
  type Prisma
} from "@funes-vault/db";
import { type Memory, type VaultExport } from "@funes-vault/shared";

import { getObjectMetadata } from "../common/serialization.js";
export function toCategoryDto(category: MemoryCategory) {
  return {
    id: category.id,
    key: category.key,
    name: category.name,
    description: category.description
  };
}
function titleFromKey(key: string) {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
export function exportCategoryDefinitions(exportFile: VaultExport) {
  const categories = new Map<string, VaultExport["categories"][number]>();

  for (const category of exportFile.categories) {
    categories.set(category.key, category);
  }

  for (const memory of exportFile.memories) {
    for (const category of memory.categories) {
      categories.set(category.key, category);
    }
    for (const key of memory.categoryKeys) {
      if (!categories.has(key)) {
        categories.set(key, {
          id: key,
          key,
          name: titleFromKey(key),
          description: null
        });
      }
    }
  }

  return [...categories.values()];
}

export function importedActiveStatus(memory: Memory) {
  // Restores keep the exported lifecycle state instead of resurrecting
  // archived or expired memories as active context.
  if (memory.status === MemoryStatus.ARCHIVED) {
    return MemoryStatus.ARCHIVED;
  }

  if (
    memory.status === MemoryStatus.EXPIRED ||
    (memory.expiresAt && new Date(memory.expiresAt) <= new Date())
  ) {
    return MemoryStatus.EXPIRED;
  }

  return MemoryStatus.ACTIVE;
}

export function importSourceMetadata(exportFile: VaultExport, memory: Memory) {
  return {
    importedFrom: {
      schemaVersion: exportFile.metadata.schemaVersion,
      exportedAt: exportFile.metadata.exportedAt,
      sourceUserId: exportFile.metadata.source.userId,
      memoryId: memory.id
    },
    originalSource: {
      type: memory.source.type,
      clientId: memory.source.clientId,
      uri: memory.source.uri,
      metadata: getObjectMetadata(memory.source.metadata)
    }
  } as Prisma.InputJsonValue;
}

export function uniqueImportName(baseName: string, claimedNames: Set<string>) {
  let candidate = `${baseName} (imported)`;
  let counter = 2;

  while (claimedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} (imported ${counter})`;
    counter += 1;
  }

  claimedNames.add(candidate.toLowerCase());

  return candidate;
}
