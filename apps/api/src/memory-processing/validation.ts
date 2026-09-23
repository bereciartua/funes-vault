import { MemorySensitivity } from "@funes-vault/db";

import { detectSecretLikeContent } from "../common/secret-like-content.js";
import type { Candidate, ExtractionInput } from "./contracts.js";
export function validateCandidate(
  candidate: Candidate,
  input: ExtractionInput
): Candidate {
  const invalid = (reason: string): Candidate => ({
    ...candidate,
    disposition: "rejected",
    reason
  });
  if (
    detectSecretLikeContent({ body: JSON.stringify(candidate) }).length ||
    candidate.sensitivity === MemorySensitivity.RESTRICTED
  ) {
    return invalid("secret_like_content");
  }
  if (
    candidate.categoryKeys.some(
      (key) => !input.categories.some((c) => c.key === key)
    )
  ) {
    return invalid("unknown_category");
  }
  if (!candidate.evidence.some((e) => e.messageId === input.source.id)) {
    return invalid("missing_source_evidence");
  }
  for (const evidence of candidate.evidence) {
    const source =
      evidence.messageId === input.source.id
        ? input.source
        : candidate.intent === "confirmation"
          ? input.context.find((c) => c.id === evidence.messageId)
          : undefined;
    if (
      !source ||
      evidence.end <= evidence.start ||
      evidence.end > source.content.length ||
      source.content.slice(evidence.start, evidence.end) !== evidence.quote
    ) {
      return invalid("invalid_source_evidence");
    }
  }
  if (!candidate.atomic) {
    return {
      ...candidate,
      disposition: "needs_clarification",
      reason: "non_atomic_claim"
    };
  }
  if (candidate.expiresAt) {
    const date = new Date(candidate.expiresAt);
    const calendar = candidate.expiresAt.slice(0, 10);
    if (
      !candidate.temporalEvidence ||
      !input.source.content.includes(candidate.temporalEvidence) ||
      !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(candidate.expiresAt) ||
      !Number.isFinite(date.getTime()) ||
      new Date(calendar).toISOString().slice(0, 10) !== calendar ||
      date.getTime() <= Date.parse(input.now)
    ) {
      return {
        ...candidate,
        expiresAt: null,
        disposition: "needs_clarification",
        reason: "ambiguous_expiration"
      };
    }
  }

  return candidate;
}
export function sanitizedFailure(error: unknown) {
  const value = error as {
    name?: string;
    status?: number;
    statusCode?: number;
  };
  if (value?.name === "TimeoutError" || value?.name === "AbortError") {
    return "deadline_or_cancelled";
  }
  if (value?.status === 429 || value?.statusCode === 429) {
    return "rate_limited";
  }

  return "provider_unavailable";
}
