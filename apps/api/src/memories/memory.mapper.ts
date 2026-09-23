import { toIsoString } from "../common/serialization.js";
import { type MemoryWithCategories } from "./memory.types.js";
export function toMemoryResponse(memory: MemoryWithCategories) {
  const categories = memory.categories.map((category) => ({
    id: category.id,
    key: category.key,
    name: category.name,
    description: category.description
  }));

  return {
    id: memory.id,
    kind: memory.kind,
    title: memory.title,
    body: memory.body,
    categories,
    categoryKeys: categories.map((category) => category.key),
    sensitivity: memory.sensitivity,
    confidence: memory.confidence,
    status: memory.status,
    reviewState: memory.reviewState,
    source: {
      type: memory.sourceType,
      clientId: memory.sourceClientId,
      uri: memory.sourceUri,
      metadata:
        typeof memory.sourceMetadata === "object" &&
        memory.sourceMetadata !== null &&
        !Array.isArray(memory.sourceMetadata)
          ? (memory.sourceMetadata as Record<string, unknown>)
          : {}
    },
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
    expiresAt: toIsoString(memory.expiresAt),
    lastConfirmedAt: toIsoString(memory.lastConfirmedAt)
  };
}
