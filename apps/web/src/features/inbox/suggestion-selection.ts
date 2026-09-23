import { type ReviewableMemorySuggestion } from "@funes-vault/shared";
export function duplicateSuggestionIds(
  suggestions: Pick<ReviewableMemorySuggestion, "id" | "title" | "body">[]
) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const suggestion of suggestions) {
    const signature = `${suggestion.title}\n${suggestion.body}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (seen.has(signature)) {
      duplicates.add(suggestion.id);
    } else {
      seen.add(signature);
    }
  }

  return duplicates;
}
