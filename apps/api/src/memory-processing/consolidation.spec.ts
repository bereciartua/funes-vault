import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { apiEnvSchema } from "../config.js";
import {
  JevMemoryConsolidationProvider,
  LlmMemoryConsolidationProvider
} from "../consolidation/consolidation.providers.js";
import { ConsolidationCandidatesService } from "../consolidation/consolidation-candidates.service.js";
import { ConsolidationLlmService } from "../consolidation/consolidation-llm.service.js";
import {
  MemoryProcessingConfigService,
  resolveProcessingConfiguration
} from "./memory-processing-config.service.js";
import { ProcessingPermissionService } from "./processing-permission.service.js";
function memory(id: string, sensitivity = "LOW") {
  return {
    id,
    userId: "u",
    title: "Concise answers",
    body: "Prefers concise answers",
    kind: "PREFERENCE",
    sensitivity,
    status: "ACTIVE",
    reviewState: "APPROVED",
    categories: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null
  };
}
async function setup(
  pairs: unknown[],
  judge = vi.fn().mockResolvedValue({ decisions: [], diagnostics: {} })
) {
  const config = resolveProcessingConfiguration(
    apiEnvSchema.parse({
      OPENAI_API_KEY: "fake",
      MEMORY_CONSOLIDATION_SYSTEM: "system_2"
    })
  );
  const service = await createService(ConsolidationLlmService, [
    {
      provide: ConsolidationCandidatesService,
      useValue: { findRecentCandidatePairs: vi.fn().mockResolvedValue(pairs) }
    },
    { provide: MemoryProcessingConfigService, useValue: { effective: config } },
    { provide: LlmMemoryConsolidationProvider, useValue: { judge } },
    { provide: JevMemoryConsolidationProvider, useValue: { judge: vi.fn() } },
    { provide: ProcessingPermissionService, useValue: { check: vi.fn() } }
  ]);

  return { service, judge };
}
describe("privacy: semantic action validation", () => {
  it("filters all six sensitivity levels before serialization", async () => {
    const memories = [
      "PUBLIC",
      "LOW",
      "INTERNAL",
      "SENSITIVE",
      "RESTRICTED",
      "SECRET"
    ].map((s, i) => memory(String(i), s));
    const { service, judge } = await setup(
      memories.map((m) => ({
        recentMemory: m,
        candidateMemory: memory(`other-${m.id}`)
      }))
    );
    const result = await service.judge("u", memories as never);
    expect(judge.mock.calls[0]![0].pairs).toHaveLength(3);
    expect(result.skippedPairs).toBe(3);
    expect(result.status).toBe("partial");
    expect(result.completedSourceIds).toEqual(["0", "1", "2"]);
  });
  it("rejects unknown pairs, cycles and plans that archive the survivor", async () => {
    const a = memory("a"),
      b = memory("b"),
      c = memory("c");
    const judge = vi.fn().mockResolvedValue({
      decisions: [
        {
          pairId: "pair_0",
          archive: "left",
          reason: "duplicate",
          confidence: 0.9,
          evidence: "duplicate"
        },
        {
          pairId: "pair_1",
          archive: "left",
          reason: "duplicate",
          confidence: 0.9,
          evidence: "duplicate"
        },
        {
          pairId: "invented",
          archive: "left",
          reason: "duplicate",
          confidence: 1,
          evidence: "invalid"
        }
      ],
      diagnostics: {}
    });
    const { service } = await setup(
      [
        { recentMemory: a, candidateMemory: b },
        { recentMemory: b, candidateMemory: c }
      ],
      judge
    );
    const result = await service.judge("u", [a, b, c] as never);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.canonicalMemory?.id).toBe("b");
  });
  it("rejects competing decisions for the same supplied pair", async () => {
    const a = memory("a"),
      b = memory("b");
    const { service } = await setup(
      [{ recentMemory: a, candidateMemory: b }],
      vi.fn().mockResolvedValue({
        decisions: ["left", "right"].map((archive) => ({
          pairId: "pair_0",
          archive,
          reason: "duplicate",
          confidence: 1,
          evidence: "conflicting"
        })),
        diagnostics: {}
      })
    );
    expect((await service.judge("u", [a, b] as never)).candidates).toEqual([]);
  });
  it("retains judged batches and does not complete failed source versions", async () => {
    const pairs = Array.from({ length: 31 }, (_, i) => ({
      recentMemory: memory(`a${i}`),
      candidateMemory: memory(`b${i}`)
    }));
    const judge = vi
      .fn()
      .mockResolvedValueOnce({ decisions: [], diagnostics: {} })
      .mockRejectedValueOnce(new Error("outage"));
    const { service } = await setup(pairs, judge);
    const result = await service.judge(
      "u",
      pairs.map((p) => p.recentMemory) as never
    );
    expect(result.status).toBe("partial");
    expect(result.completedSourceIds).toHaveLength(30);
    expect(result.completedSourceIds).not.toContain("a30");
  });
  it("distinguishes an outage from a completed no-op", async () => {
    const a = memory("a"),
      b = memory("b");
    const { service } = await setup(
      [{ recentMemory: a, candidateMemory: b }],
      vi.fn().mockRejectedValue(new Error("sensitive provider body"))
    );
    const result = await service.judge("u", [a] as never);
    expect(result.status).toBe("failed");
    expect(result.completedSourceIds).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("sensitive provider body");
  });
});
