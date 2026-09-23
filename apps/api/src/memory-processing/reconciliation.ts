import { extractTerms } from "../common/text.js";

export function termFilters(terms: string[]) {
  return terms.flatMap((term) => [
    { title: { contains: term, mode: "insensitive" as const } },
    { body: { contains: term, mode: "insensitive" as const } }
  ]);
}

export function reconciliationTerms(text: string) {
  return extractTerms(text, 16);
}
