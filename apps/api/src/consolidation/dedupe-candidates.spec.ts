import { describe, expect, it } from "vitest";

import type { ArchiveCandidate } from "./consolidation.types.js";
import { dedupeCandidates } from "./dedupe-candidates.js";
// Discovery provides full records; this pure decision only reads ids and reasons.
function candidate(
  id: string,
  canonical?: string,
  reason: ArchiveCandidate["reason"] = "exact_duplicate"
) {
  return {
    memory: { id },
    canonicalMemory: canonical ? { id: canonical } : undefined,
    reason,
    evidence: "test"
  };
}
describe("privacy: consolidation candidate deduplication", () => {
  it("keeps the first action for a target", () => {
    const first = candidate("a", "b");
    expect(dedupeCandidates([first, candidate("a", "c")])).toEqual([first]);
  });
  it("does not archive a canonical record or use an expired canonical record", () => {
    const first = candidate("a", "b");
    expect(dedupeCandidates([first, candidate("b", "c")])).toEqual([first]);
    const expired = candidate("b", undefined, "expired");
    expect(dedupeCandidates([first, expired])).toEqual([expired]);
  });
  it("keeps independent actions and rejects reciprocal archive cycles", () => {
    const first = candidate("a", "b"),
      independent = candidate("c", "d");
    expect(dedupeCandidates([first, candidate("b", "a"), independent])).toEqual(
      [first, independent]
    );
  });
});
