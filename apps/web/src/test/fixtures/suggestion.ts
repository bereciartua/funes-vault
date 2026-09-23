import type { ReviewableMemorySuggestion } from "@funes-vault/shared";
export function suggestionFixture(
  id: string,
  title: string,
  overrides: Partial<ReviewableMemorySuggestion> = {}
): ReviewableMemorySuggestion {
  return {
    id,
    title,
    body: `${title} body`,
    kind: "FACT",
    sensitivity: "LOW",
    categoryKeys: [],
    evidence: "Captured from the test harness.",
    confidence: 0.8,
    expiresAt: null,
    status: "QUEUED_FOR_REVIEW",
    source: {
      type: "MANUAL",
      clientId: null,
      metadata: {},
      subjects: []
    },
    createdAt: "2026-07-09T12:00:00.000Z",
    updatedAt: "2026-07-09T12:00:00.000Z",
    ...overrides
  };
}
