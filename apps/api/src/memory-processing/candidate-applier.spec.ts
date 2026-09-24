import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { mockPrisma } from "../../test/mocks/prisma.js";
import { apiEnvSchema } from "../config.js";
import { SuggestionIntakeService } from "../memory-suggestions/suggestion-intake.service.js";
import { SuggestionWriterService } from "../memory-suggestions/suggestion-writer.service.js";
import { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import { CandidateApplier } from "./candidate-applier.js";
import type { Candidate } from "./contracts.js";
import { resolveProcessingConfiguration } from "./memory-processing-config.service.js";

const candidate: Candidate = {
  id: "candidate",
  title: "  Prefers short answers  ",
  body: "  I prefer short answers.  ",
  kind: "PREFERENCE",
  categoryKeys: [" preferences "],
  sensitivity: "LOW",
  expiresAt: null,
  temporalEvidence: null,
  intent: "assertion",
  atomic: true,
  disposition: "eligible",
  reason: "explicit",
  evidence: [
    { messageId: "source", start: 0, end: 23, quote: "I prefer short answers." }
  ]
};
async function setup() {
  const prisma = mockPrisma();
  const createSuggestion = vi.fn().mockResolvedValue({
    status: "QUEUED_FOR_REVIEW",
    suggestionId: "suggestion",
    memoryId: null
  });
  const service = await createService(CandidateApplier, [
    {
      provide: PolicyEvaluationService,
      useValue: {
        evaluateForClient: vi.fn().mockResolvedValue({ decision: "ALLOW" })
      }
    },
    { provide: SuggestionIntakeService, useValue: { createSuggestion } },
    {
      provide: SuggestionWriterService,
      useValue: { enqueueEmbeddingGeneration: vi.fn() }
    }
  ]);
  const configuration = resolveProcessingConfiguration(apiEnvSchema.parse({}));

  return {
    prisma,
    createSuggestion,
    apply: (value: Candidate) =>
      service.applyCandidate(
        prisma,
        "owner",
        "run",
        "source",
        "client",
        "chat",
        value,
        configuration
      )
  };
}
describe("candidate suggestion boundary", () => {
  it("normalizes provider text before suggestion intake", async () => {
    const { apply, createSuggestion } = await setup();
    await apply(candidate);
    expect(createSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          title: "Prefers short answers",
          body: "I prefer short answers.",
          categoryKeys: ["preferences"]
        })
      })
    );
  });
  it.each([
    { expiresAt: "next Friday" },
    {
      evidence: [
        { messageId: "source", start: 0, end: 2001, quote: "a".repeat(2001) }
      ]
    }
  ])(
    "rejects malformed provider output before writing: %j",
    async (invalid) => {
      const { apply, createSuggestion, prisma } = await setup();
      await expect(apply({ ...candidate, ...invalid })).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(createSuggestion).not.toHaveBeenCalled();
      expect(prisma.memoryCandidateApplication.create).not.toHaveBeenCalled();
    }
  );
});
