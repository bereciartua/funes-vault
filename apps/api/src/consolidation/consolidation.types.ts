import type { ConsolidationMode } from "@funes-vault/db";

import { toIsoString } from "../common/serialization.js";
import { extractTerms } from "../common/text.js";
import type { MemoryWithCategories } from "../memories/memory.types.js";

export type ConsolidationTrigger = "manual" | "manual_retry" | "scheduled";

export type ConsolidationJobData = {
  userId: string;
  jobRunId?: string;
  trigger?: ConsolidationTrigger;
};

type ArchiveCandidateReason =
  | "expired"
  | "exact_duplicate"
  | "semantic_duplicate"
  | "conflict"
  | "superseded";

export type ArchiveCandidate = {
  processing?: Record<string, unknown>;
  memory: MemoryWithCategories;
  reason: ArchiveCandidateReason;
  evidence: string;
  confidence?: number;
  canonicalMemory?: MemoryWithCategories;
};

export type ConsolidationActionSummary = {
  action: "archive_memory";
  reason: ArchiveCandidateReason;
  evidence: string;
  confidence: number;
  targetMemoryId: string;
  targetLabel: string;
  canonicalMemoryId: string | null;
  canonicalLabel: string | null;
  suggestionId: string | null;
  auditEventId: string | null;
  applied: boolean;
  mode: ConsolidationMode;
};

export type ConsolidationPair = {
  recentMemory: MemoryWithCategories;
  candidateMemory: MemoryWithCategories;
  score: number;
  source: "semantic" | "lexical";
};

export type SemanticResult = {
  memoryId: string;
  score: number;
};

export type MemoryIdRow = {
  id: string;
};

export const recentConsolidationWindowHours = 24;
export const semanticCandidateLimit = 8;
export const lexicalCandidateLimit = 60;
export const exactDuplicateCandidateLimit = 50;
export const maxLlmPairs = 30;
export const minimumSemanticScore = 0.72;
export const minimumLexicalScore = 0.34;
export const minimumLlmConfidence = 0.65;

export function consolidationSchedulerId(userId: string) {
  return `consolidation-${userId}`;
}

export function normalizeForDuplicate(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function categoryKeys(memory: Pick<MemoryWithCategories, "categories">) {
  return memory.categories.map((category) => category.key);
}

export function toLlmMemory(memory: MemoryWithCategories) {
  return {
    id: memory.id,
    kind: memory.kind,
    title: memory.title,
    body: memory.body,
    categoryKeys: categoryKeys(memory),
    sensitivity: memory.sensitivity,
    confidence: memory.confidence,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
    lastConfirmedAt: toIsoString(memory.lastConfirmedAt),
    expiresAt: toIsoString(memory.expiresAt)
  };
}

export function pairKey(leftId: string, rightId: string) {
  return [leftId, rightId].sort().join("::");
}

export function lexicalSimilarity(
  left: Pick<MemoryWithCategories, "title" | "body" | "kind" | "categories">,
  right: Pick<MemoryWithCategories, "title" | "body" | "kind" | "categories">
) {
  const leftTerms = new Set(extractTerms(`${left.title} ${left.body}`));
  const rightTerms = new Set(extractTerms(`${right.title} ${right.body}`));

  if (leftTerms.size === 0 || rightTerms.size === 0) {
    return 0;
  }

  const intersection = [...leftTerms].filter((term) => rightTerms.has(term));
  const union = new Set([...leftTerms, ...rightTerms]);
  const termScore = intersection.length / union.size;
  const categoryScore = categoryKeys(left).some((key) =>
    categoryKeys(right).includes(key)
  )
    ? 0.15
    : 0;
  const kindScore = left.kind === right.kind ? 0.1 : 0;

  return Math.min(1, termScore + categoryScore + kindScore);
}

export function candidateConfidence(candidate: ArchiveCandidate) {
  return (
    candidate.confidence ??
    (candidate.reason === "exact_duplicate" ? 0.95 : minimumLlmConfidence)
  );
}

export function toConsolidationActionSummary(
  candidate: ArchiveCandidate,
  input: {
    mode: ConsolidationMode;
    applied: boolean;
    suggestionId: string | null;
    auditEventId: string | null;
  }
): ConsolidationActionSummary {
  return {
    action: "archive_memory",
    reason: candidate.reason,
    evidence: candidate.evidence,
    confidence: candidateConfidence(candidate),
    targetMemoryId: candidate.memory.id,
    targetLabel: candidate.memory.title,
    canonicalMemoryId: candidate.canonicalMemory?.id ?? null,
    canonicalLabel: candidate.canonicalMemory?.title ?? null,
    suggestionId: input.suggestionId,
    auditEventId: input.auditEventId,
    applied: input.applied,
    mode: input.mode
  };
}
