import {
  MemoryStatus,
  type MemorySuggestion,
  MemorySuggestionStatus,
  type Prisma,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import { type CreateMemorySuggestionRequest } from "@funes-vault/shared";

import {
  getObjectMetadata,
  toDateOrNull,
  toJson
} from "../common/serialization.js";
import { memoryInclude } from "../memories/memory.types.js";
import { toCategoryConnect } from "../memories/memory-update.js";
export async function createSuggestionRecord(
  tx: Pick<Prisma.TransactionClient, "memorySuggestion">,
  input: {
    userId: string;
    sourceType: SourceType;
    sourceClientId: string | null;
    request: CreateMemorySuggestionRequest;
    status?: MemorySuggestionStatus;
    policyId?: string | null;
    serverMetadata?: Record<string, unknown>;
  }
) {
  return tx.memorySuggestion.create({
    data: {
      userId: input.userId,
      sourceType: input.sourceType,
      sourceClientId: input.sourceClientId,
      title: input.request.title,
      body: input.request.body,
      suggestedKind: input.request.kind,
      suggestedSensitivity: input.request.sensitivity,
      suggestedCategories: input.request.categoryKeys,
      evidence: input.request.evidence,
      statedPurpose: input.request.purpose,
      policyId: input.policyId ?? null,
      sourceMetadata: toJson({
        ...input.serverMetadata,
        statedPurpose: input.request.purpose,
        policyId: input.policyId ?? null,
        caller: input.request.sourceMetadata
      }),
      confidence: input.request.confidence,
      expiresAt: toDateOrNull(input.request.expiresAt),
      status: input.status ?? MemorySuggestionStatus.QUEUED_FOR_REVIEW
    }
  });
}
export function createMemoryFromSuggestion(
  tx: Pick<Prisma.TransactionClient, "memory">,
  suggestion: MemorySuggestion,
  metadata: Record<string, unknown> = {}
) {
  return tx.memory.create({
    data: {
      userId: suggestion.userId,
      kind: suggestion.suggestedKind,
      title: suggestion.title,
      body: suggestion.body,
      sensitivity: suggestion.suggestedSensitivity,
      confidence: suggestion.confidence,
      expiresAt: suggestion.expiresAt,
      status: MemoryStatus.ACTIVE,
      reviewState: ReviewState.APPROVED,
      sourceType: suggestion.sourceType,
      sourceClientId: suggestion.sourceClientId,
      sourceMetadata: toJson({
        suggestionId: suggestion.id,
        evidence: suggestion.evidence,
        sourceMetadata: getObjectMetadata(suggestion.sourceMetadata),
        ...metadata
      }),
      categories: toCategoryConnect(suggestion.suggestedCategories)
    },
    include: memoryInclude
  });
}
