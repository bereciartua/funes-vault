import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  JevMemoryConsolidationProvider,
  LlmMemoryConsolidationProvider
} from "../src/consolidation/consolidation.providers.js";
import { ConsolidationCandidatesService } from "../src/consolidation/consolidation-candidates.service.js";
import { ConsolidationJobService } from "../src/consolidation/consolidation-job.service.js";
import { ConsolidationOrchestratorService } from "../src/consolidation/consolidation-orchestrator.service.js";
import { memoryInclude } from "../src/memories/memory.types.js";
import { SuggestionReviewService } from "../src/memory-suggestions/suggestion-review.service.js";
import { createUserWithSession } from "./e2e-harness.js";
import { processingE2eHarness } from "./fixtures/processing-e2e.js";
describe("privacy: memory processing consolidation (e2e)", () => {
  const state = processingE2eHarness();
  let app: ReturnType<typeof state>["app"];
  let prisma: ReturnType<typeof state>["prisma"];
  let configure: ReturnType<typeof state>["configure"];
  beforeEach(() => {
    ({ app, prisma, configure } = state());
  });
  it.each(["system_1", "system_2"] as const)(
    "queues %s archive proposals and rejects approval after a concurrent edit",
    async (system) => {
      configure("system_2", "policy", system);
      const user = await createUserWithSession(
        prisma,
        `${system}-archive@example.com`
      );
      await prisma.processingConsent.create({
        data: {
          userId: user.userId,
          processor: "typesafe",
          scope: "consolidation",
          version: 1
        }
      });
      const left = await prisma.memory.create({
        data: {
          userId: user.userId,
          kind: "PREFERENCE",
          title: "Short answers",
          body: "Prefers concise answers.",
          reviewState: "APPROVED"
        },
        include: memoryInclude
      });
      const right = await prisma.memory.create({
        data: {
          userId: user.userId,
          kind: "PREFERENCE",
          title: "Brief responses",
          body: "Prefers brief technical responses.",
          reviewState: "APPROVED"
        },
        include: memoryInclude
      });
      const discovery = vi
        .spyOn(
          app.get(ConsolidationCandidatesService),
          "findRecentCandidatePairs"
        )
        .mockResolvedValue([
          {
            recentMemory: left,
            candidateMemory: right,
            score: 0.9,
            source: "lexical"
          }
        ]);
      const judge = vi
        .spyOn(
          system === "system_1"
            ? app.get(JevMemoryConsolidationProvider)
            : app.get(LlmMemoryConsolidationProvider),
          "judge"
        )
        .mockResolvedValue({
          decisions: [
            {
              pairId: "pair_0",
              archive: "left",
              reason: "duplicate",
              confidence: 0.95,
              evidence: "Same preference"
            }
          ],
          diagnostics: { model: "fake" }
        });
      const runner = app.get(ConsolidationJobService);
      const job = await runner.createConsolidationJobRun(user.userId, "manual");
      const result = await app
        .get(ConsolidationOrchestratorService)
        .runConsolidation({
          userId: user.userId,
          jobRunId: job.id
        });
      expect(result.semantic.status).toBe("completed");
      expect(result.suggestionIds).toHaveLength(1);
      await prisma.memory.update({
        where: { id: left.id },
        data: { body: "Only concise answers during emergencies." }
      });
      await expect(
        app
          .get(SuggestionReviewService)
          .applyUserSuggestion(user.userId, result.suggestionIds[0]!)
      ).rejects.toThrow();
      expect(
        (await prisma.memory.findUniqueOrThrow({ where: { id: left.id } }))
          .status
      ).toBe("ACTIVE");
      judge.mockRestore();
      discovery.mockRestore();
    }
  );
  it("retries unfinished semantic versions outside the recency window with their original provider", async () => {
    const user = await createUserWithSession(prisma, "aged-retry@example.com");
    const old = new Date("2020-01-01T00:00:00Z");
    const left = await prisma.memory.create({
      data: {
        userId: user.userId,
        kind: "PREFERENCE",
        title: "Old short answer preference",
        body: "Prefers concise answers.",
        reviewState: "APPROVED",
        consolidationRelevantAt: old,
        updatedAt: old
      },
      include: memoryInclude
    });
    const right = await prisma.memory.create({
      data: {
        userId: user.userId,
        kind: "PREFERENCE",
        title: "Different scoped preference",
        body: "Prefers detailed tutorials.",
        reviewState: "APPROVED"
      },
      include: memoryInclude
    });
    const discovery = vi
      .spyOn(
        app.get(ConsolidationCandidatesService),
        "findRecentCandidatePairs"
      )
      .mockResolvedValue([
        {
          recentMemory: left,
          candidateMemory: right,
          score: 0.9,
          source: "lexical"
        }
      ]);
    const judge = vi
      .spyOn(app.get(LlmMemoryConsolidationProvider), "judge")
      .mockRejectedValueOnce(new Error("temporary provider outage"))
      .mockResolvedValueOnce({ decisions: [], diagnostics: { model: "fake" } });
    const runner = app.get(ConsolidationJobService);
    const job = await runner.createConsolidationJobRun(user.userId, "manual");
    const first = await app
      .get(ConsolidationOrchestratorService)
      .runConsolidation({
        userId: user.userId,
        jobRunId: job.id
      });
    expect(first.semantic.status).toBe("failed");
    expect(
      (await prisma.memory.findUniqueOrThrow({ where: { id: left.id } }))
        .semanticInspectedAt
    ).toBeNull();
    configure("system_2", "policy", "system_1");
    const retried = await app
      .get(ConsolidationOrchestratorService)
      .runConsolidation({
        userId: user.userId,
        jobRunId: job.id
      });
    expect(retried.semantic.status).toBe("completed");
    expect(retried.sourceVersions).toEqual(first.sourceVersions);
    expect(judge).toHaveBeenCalledTimes(2);
    expect(
      (await prisma.memory.findUniqueOrThrow({ where: { id: left.id } }))
        .semanticInspectedAt
    ).not.toBeNull();
    judge.mockRestore();
    discovery.mockRestore();
  });
});
