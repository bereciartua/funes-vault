import type { Memory } from "@funes-vault/shared";
export function memoryFixture(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "memory-one",
    kind: "PREFERENCE",
    title: "Concise answers",
    body: "Prefer concise answers with concrete examples.",
    categories: [],
    categoryKeys: [],
    sensitivity: "INTERNAL",
    confidence: 0.8,
    status: "ACTIVE",
    reviewState: "APPROVED",
    source: { type: "MANUAL", clientId: null, uri: null, metadata: {} },
    createdAt: "2026-09-22T12:00:00.000Z",
    updatedAt: "2026-09-22T12:00:00.000Z",
    expiresAt: null,
    lastConfirmedAt: null,
    ...overrides
  };
}
export function pageFixture<T>(items: T[], page = 1, limit = 10) {
  return {
    items,
    pagination: {
      page,
      limit,
      total: items.length,
      totalPages: items.length ? 1 : 0
    }
  };
}
