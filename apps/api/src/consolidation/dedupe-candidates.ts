import type { ArchiveCandidate } from "./consolidation.types.js";

/** Prefer the first viable action; never archive a canonical target selected elsewhere. */
export function dedupeCandidates<
  T extends {
    memory: { id: string };
    canonicalMemory?: { id: string };
    reason: ArchiveCandidate["reason"];
  }
>(candidates: T[]) {
  const seenMemoryIds = new Set<string>();

  return candidates.filter((candidate) => {
    if (seenMemoryIds.has(candidate.memory.id)) {
      return false;
    }

    if (
      candidate.canonicalMemory &&
      (seenMemoryIds.has(candidate.canonicalMemory.id) ||
        candidates.some(
          (other) =>
            other.memory.id === candidate.canonicalMemory?.id &&
            other.reason === "expired"
        ))
    ) {
      return false;
    }
    if (
      candidates.some(
        (other) =>
          seenMemoryIds.has(other.memory.id) &&
          other.canonicalMemory?.id === candidate.memory.id
      )
    ) {
      return false;
    }
    seenMemoryIds.add(candidate.memory.id);

    return true;
  });
}
