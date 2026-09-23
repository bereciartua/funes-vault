import { describe, expect, it } from "vitest";

import {
  type BundleCandidate,
  BundleCompilerService
} from "./bundle-compiler.service.js";
const candidate = (id: string, body: string): BundleCandidate => ({
  id,
  title: id,
  body,
  sensitivity: "LOW",
  categories: [{ key: "preferences" }],
  relevanceScore: 0.98765
});
describe("privacy: disclosure token budget", () => {
  const compiler = new BundleCompilerService();
  it("clips an oversized first item and never exceeds the estimate budget", () => {
    const result = compiler.compile({
      candidates: [
        candidate("one", "x".repeat(1000)),
        candidate("two", "more")
      ],
      tokenBudget: 20
    });
    expect(result.items).toHaveLength(1);
    expect(result.estimatedTokens).toBeLessThanOrEqual(20);
    expect(result.items[0]).toMatchObject({
      memoryId: "one",
      category: "preferences",
      relevanceScore: 0.988
    });
  });
  it("skips later oversized items while allowing smaller useful items", () => {
    const result = compiler.compile({
      candidates: [
        candidate("a", "short"),
        candidate("b", "x".repeat(1000)),
        candidate("c", "short")
      ],
      tokenBudget: 20
    });
    expect(result.items.map((i) => i.memoryId)).toEqual(["a", "c"]);
    expect(result.estimatedTokens).toBeLessThanOrEqual(20);
  });
  it("emits no invented context for an empty candidate set", () => {
    expect(compiler.compile({ candidates: [], tokenBudget: 10 })).toMatchObject(
      { items: [], estimatedTokens: 0 }
    );
  });
});
