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
  const evaluateForClient = vi.fn().mockResolvedValue({ decision: "ALLOW" });
  const service = await createService(CandidateApplier, [
    {
      provide: PolicyEvaluationService,
      useValue: {
        evaluateForClient
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
    evaluateForClient,
    createSuggestion,
    apply: (value: Candidate, channel: "chat" | "voice" = "chat") =>
      service.applyCandidate(
        prisma,
        "owner",
        "run",
        "source",
        "client",
        channel,
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
  it("checks normalized categories before deduplication", async () => {
    const { apply, evaluateForClient, prisma, createSuggestion } =
      await setup();
    prisma.memory.findFirst.mockResolvedValue({ id: "existing" });
    const outcome = await apply(candidate);
    expect(
      evaluateForClient.mock.calls[0]?.[1].candidateMemories[0].categories
    ).toEqual([{ key: "preferences" }]);
    expect(outcome.status).toBe("deduplicated");
    expect(createSuggestion).not.toHaveBeenCalled();
  });
  it("records removed permission denial without looking up duplicate memories", async () => {
    const { apply, evaluateForClient, prisma, createSuggestion } =
      await setup();
    evaluateForClient.mockResolvedValue({
      decision: "DENY",
      reason: "no_client_policy"
    });
    createSuggestion.mockResolvedValue({
      status: "DENIED",
      reason: "no_client_policy",
      suggestionId: null,
      memoryId: null
    });
    expect(await apply(candidate)).toMatchObject({
      status: "DENIED",
      reason: "no_client_policy"
    });
    expect(prisma.memory.findFirst).not.toHaveBeenCalled();
    expect(prisma.memorySuggestion.findFirst).not.toHaveBeenCalled();
    expect(prisma.memoryCandidateApplication.create).toHaveBeenCalled();
  });
  it("lets the voice app’s permissions determine WRITE in policy mode", async () => {
    const { apply, createSuggestion } = await setup();
    await apply(candidate, "voice");
    expect(createSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ reviewOnly: false })
    );
  });
});
