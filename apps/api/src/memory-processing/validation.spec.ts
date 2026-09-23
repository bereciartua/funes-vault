import { describe, expect, it } from "vitest";

import type { Candidate, ExtractionInput } from "./contracts.js";
import { sanitizedFailure, validateCandidate } from "./validation.js";
const content = "I prefer concise answers.";
const input: ExtractionInput = {
  source: { id: "source", content },
  channel: "chat",
  context: [],
  categories: [
    { key: "communication_style", name: "Communication", description: null }
  ],
  now: "2026-09-22T12:00:00Z",
  timezone: "UTC"
};
const candidate: Candidate = {
  id: "candidate",
  title: "Style",
  body: content,
  kind: "PREFERENCE",
  categoryKeys: ["communication_style"],
  sensitivity: "LOW",
  expiresAt: null,
  temporalEvidence: null,
  intent: "assertion",
  atomic: true,
  disposition: "eligible",
  reason: "explicit",
  evidence: [
    { messageId: "source", start: 0, end: content.length, quote: content }
  ]
};
describe("privacy: extracted candidate validation", () => {
  it("requires exact source evidence and known categories", () => {
    expect(validateCandidate(candidate, input)).toEqual(candidate);
    expect(
      validateCandidate({ ...candidate, categoryKeys: ["unknown"] }, input)
        .reason
    ).toBe("unknown_category");
    expect(
      validateCandidate(
        {
          ...candidate,
          evidence: [{ ...candidate.evidence[0]!, quote: "invented" }]
        },
        input
      ).reason
    ).toBe("invalid_source_evidence");
    expect(
      validateCandidate({ ...candidate, evidence: [] }, input).reason
    ).toBe("missing_source_evidence");
  });
  it("rejects secrets and restricted candidates, and defers compound claims", () => {
    expect(
      validateCandidate({ ...candidate, body: "sk-" + "x".repeat(24) }, input)
        .disposition
    ).toBe("rejected");
    expect(
      validateCandidate({ ...candidate, sensitivity: "RESTRICTED" }, input)
        .disposition
    ).toBe("rejected");
    expect(
      validateCandidate({ ...candidate, atomic: false }, input).disposition
    ).toBe("needs_clarification");
  });
  it("removes expiration dates without supported future temporal evidence", () => {
    expect(
      validateCandidate(
        { ...candidate, expiresAt: "2026-09-23T12:00:00Z" },
        input
      )
    ).toMatchObject({ expiresAt: null, reason: "ambiguous_expiration" });
  });
  it("never exposes provider errors as processing outcomes", () => {
    expect(sanitizedFailure(new Error("private payload"))).toBe(
      "provider_unavailable"
    );
    expect(sanitizedFailure({ status: 429 })).toBe("rate_limited");
    expect(sanitizedFailure({ name: "AbortError" })).toBe(
      "deadline_or_cancelled"
    );
  });
});
