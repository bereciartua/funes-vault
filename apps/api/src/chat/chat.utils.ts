import type { ChatCitation, ChatProviderDisclosure } from "@funes-vault/shared";
import { z } from "zod";

export function clip(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3).trimEnd()}...`
    : value;
}

export function previewText(value: string | null) {
  const normalized = value?.replace(/\s+/gu, " ").trim() ?? "";

  return normalized ? clip(normalized, 140) : null;
}

export function citationsForRefs(refs: number[], citations: ChatCitation[]) {
  const seen = new Set<number>();

  return refs
    .filter((ref) => {
      if (seen.has(ref)) {
        return false;
      }
      seen.add(ref);

      return true;
    })
    .map((ref) => citations[ref - 1])
    .filter((citation): citation is ChatCitation => Boolean(citation));
}

export function parseCitationArray(value: unknown) {
  const parsed = z
    .array(
      z.object({
        memoryId: z.string(),
        title: z.string(),
        categoryKeys: z.array(z.string()),
        sensitivity: z.enum([
          "PUBLIC",
          "LOW",
          "INTERNAL",
          "SENSITIVE",
          "RESTRICTED",
          "SECRET"
        ]),
        relevanceScore: z.number()
      })
    )
    .safeParse(value);

  return parsed.success ? parsed.data : [];
}

export function parseProvider(
  value: unknown
): ChatProviderDisclosure | undefined {
  const parsed = z
    .object({
      provider: z.string(),
      model: z.string(),
      usesThirdParty: z.boolean(),
      disclosure: z.string(),
      channel: z.enum(["text", "voice"]).optional()
    })
    .safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

export function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return clip(error.message.replace(/\s+/gu, " "), 300);
  }

  return "Unknown provider error";
}
