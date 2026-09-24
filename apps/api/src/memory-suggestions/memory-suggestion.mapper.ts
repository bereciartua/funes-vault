import { type MemorySuggestion } from "@funes-vault/db";

import { getObjectMetadata } from "../common/serialization.js";
export function toMemorySuggestionResponse(
  suggestion: MemorySuggestion,
  subjects: Array<{
    type: string;
    id: string;
    role: string;
    label: string | null;
    metadata: Record<string, unknown>;
    memoryStatus?: string | null;
    memorySensitivity?: string | null;
  }> = []
) {
  return {
    id: suggestion.id,
    statedPurpose: suggestion.statedPurpose,
    policyId: suggestion.policyId,
    title: suggestion.title,
    body: suggestion.body,
    kind: suggestion.suggestedKind,
    sensitivity: suggestion.suggestedSensitivity,
    categoryKeys: suggestion.suggestedCategories,
    evidence: suggestion.evidence,
    confidence: suggestion.confidence,
    expiresAt: suggestion.expiresAt?.toISOString() ?? null,
    status: suggestion.status,
    source: {
      type: suggestion.sourceType,
      clientId: suggestion.sourceClientId,
      metadata: getObjectMetadata(suggestion.sourceMetadata),
      subjects
    },
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString()
  };
}
