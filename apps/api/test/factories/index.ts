import {
  AuditActorType,
  AuditEventType,
  MemoryKind,
  MemorySensitivity,
  MemorySuggestionStatus,
  SourceType
} from "@funes-vault/db";
const now = new Date("2026-06-27T12:00:00.000Z");

export function createMemory(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-06-27T12:00:00.000Z");

  return {
    id: "memory_1",
    userId: "user_1",
    kind: "PREFERENCE",
    title: "Prefers concise help",
    body: "The user prefers concise implementation help.",
    sensitivity: "LOW",
    confidence: 1,
    status: "ACTIVE",
    reviewState: "APPROVED",
    sourceType: "MANUAL",
    sourceClientId: null,
    sourceUri: null,
    sourceMetadata: {},
    lastConfirmedAt: null,
    expiresAt: null,
    consolidationRelevantAt:
      overrides.updatedAt instanceof Date ? overrides.updatedAt : now,
    lastConsolidatedAt: null,
    createdAt: now,
    updatedAt: now,
    categories: [
      {
        id: "category_1",
        key: "communication_style",
        name: "Communication Style",
        description: null,
        createdAt: now,
        updatedAt: now
      }
    ],
    ...overrides
  };
}

export function createClient(overrides: Record<string, unknown> = {}) {
  return {
    id: "client_1",
    userId: "user_1",
    name: "Local Agent",
    type: "MCP_CLIENT",
    trustLevel: "APPROVED",
    declaredRetention: "NO_STORAGE",
    tokenHash: "token_hash",
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
    _count: { policies: 1 },
    ...overrides
  };
}

export function createPolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: "policy_1",
    userId: "user_1",
    clientId: "client_1",
    maxSensitivity: "INTERNAL",
    operations: ["READ"],
    requiresConfirmation: true,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    allowedCategories: [{ key: "software_development" }],
    deniedCategories: [],
    client: { name: "Local Agent" },
    ...overrides
  };
}

export function createSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: "suggestion_1",
    userId: "user_1",
    sourceType: SourceType.CHAT,
    sourceClientId: null,
    statedPurpose: null,
    policyId: null,
    title: "Uses TypeScript often",
    body: "The user frequently works in TypeScript projects.",
    suggestedKind: MemoryKind.PREFERENCE,
    suggestedSensitivity: MemorySensitivity.LOW,
    suggestedCategories: ["software_development"],
    evidence: "Guided answer.",
    confidence: 0.72,
    status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

export function createAuditEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit_1",
    userId: "user_1",
    type: AuditEventType.CLIENT_CREATED,
    actorType: AuditActorType.USER,
    actorId: "user_1",
    clientId: "client_1",
    memoryRequestId: null,
    metadata: {},
    createdAt: now,
    client: { name: "Local Agent" },
    subjects: [],
    ...overrides
  };
}
