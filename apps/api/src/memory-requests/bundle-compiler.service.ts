import { type MemorySensitivity } from "@funes-vault/db";
import { Injectable } from "@nestjs/common";

export type BundleCandidate = {
  id: string;
  title: string;
  body: string;
  sensitivity: MemorySensitivity;
  categories: Array<{ key: string }>;
  relevanceScore: number;
};

export type CompiledBundleItem = {
  memoryId: string;
  text: string;
  category: string | null;
  sensitivity: MemorySensitivity;
  relevanceScore: number;
  estimatedTokens: number;
};

/**
 * Owns deterministic token-budgeted disclosure bundles.
 * Tenant boundary: caller supplies an already authorized candidate set.
 * Audit: pure transformation; no persistence or audit writes.
 */
@Injectable()
export class BundleCompilerService {
  compile(input: { candidates: BundleCandidate[]; tokenBudget: number }) {
    const items: CompiledBundleItem[] = [];
    let estimatedTokens = 0;

    for (const candidate of input.candidates) {
      const text = this.formatMemory(candidate);
      const itemTokens = estimateTokens(text);

      if (
        items.length > 0 &&
        estimatedTokens + itemTokens > input.tokenBudget
      ) {
        continue;
      }

      if (itemTokens > input.tokenBudget) {
        const clipped = clipToEstimatedTokens(text, input.tokenBudget);
        const clippedTokens = estimateTokens(clipped);

        items.push({
          memoryId: candidate.id,
          text: clipped,
          category: candidate.categories[0]?.key ?? null,
          sensitivity: candidate.sensitivity,
          relevanceScore: roundScore(candidate.relevanceScore),
          estimatedTokens: clippedTokens
        });
        estimatedTokens += clippedTokens;
        continue;
      }

      items.push({
        memoryId: candidate.id,
        text,
        category: candidate.categories[0]?.key ?? null,
        sensitivity: candidate.sensitivity,
        relevanceScore: roundScore(candidate.relevanceScore),
        estimatedTokens: itemTokens
      });
      estimatedTokens += itemTokens;
    }

    return {
      items,
      estimatedTokens,
      instructions: [
        "Use this context only for the declared task.",
        "Do not retain or disclose this context beyond the declared retention."
      ]
    };
  }

  private formatMemory(candidate: BundleCandidate) {
    return `${candidate.title}: ${candidate.body}`;
  }
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function clipToEstimatedTokens(text: string, tokenBudget: number) {
  const maxCharacters = Math.max(1, tokenBudget * 4);

  if (text.length <= maxCharacters) {
    return text;
  }

  return text.slice(0, Math.max(1, maxCharacters - 1)).trimEnd();
}

function roundScore(score: number) {
  return Math.round(score * 1000) / 1000;
}
