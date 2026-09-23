import { MemoryKind } from "@funes-vault/db";
import { describe, expect, it } from "vitest";

import {
  lexicalSimilarity,
  minimumLexicalScore
} from "./consolidation.types.js";
function memory(body: string) {
  return { title: "", body, kind: MemoryKind.FACT, categories: [] };
}
describe("Unicode consolidation similarity", () => {
  it("finds matching accented words without conversational filler", () => {
    expect(
      lexicalSimilarity(
        memory("Please remember café Zürich"),
        memory("café Zürich")
      )
    ).toBe(1);
  });
  it("keeps unrelated meaningful terms below the consolidation threshold", () => {
    expect(
      lexicalSimilarity(
        memory("Please remember café Zürich"),
        memory("Please remember 東京 旅行記")
      )
    ).toBeLessThan(minimumLexicalScore);
  });
  it("does not treat shared filler alone as evidence of a duplicate", () => {
    expect(
      lexicalSimilarity(
        memory("please remember the memory"),
        memory("remember the memory")
      )
    ).toBe(0);
  });
});
