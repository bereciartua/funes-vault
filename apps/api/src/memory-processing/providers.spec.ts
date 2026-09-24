import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { memoryFixtures } from "../../test/fixtures/memory-processing.js";
import { apiEnvSchema, validateEnvironment } from "../config.js";
import { JevMemoryConsolidationProvider } from "../consolidation/consolidation.providers.js";
import type {
  Candidate,
  ExtractionInput,
  ProcessingContext
} from "./contracts.js";
import {
  JevMemoryExtractionProvider,
  sourceSpans
} from "./jev-memory-extraction.provider.js";
import { resolveProcessingConfiguration } from "./memory-processing-config.service.js";
import { MemoryProcessingConfigService } from "./memory-processing-config.service.js";
import { ProcessingPermissionService } from "./processing-permission.service.js";
import { validateCandidate } from "./validation.js";
const input: ExtractionInput = {
  source: { id: "source", content: "Remember I do not drink coffee. ☕" },
  channel: "chat",
  context: [],
  categories: [{ key: "preference", name: "Preference", description: null }],
  now: "2026-09-20T12:00:00Z",
  timezone: "America/New_York"
};
const candidate: Candidate = {
  id: "c1",
  title: "No coffee",
  body: "The user does not drink coffee.",
  kind: "PREFERENCE",
  categoryKeys: ["preference"],
  sensitivity: "LOW",
  expiresAt: null,
  temporalEvidence: null,
  intent: "remember",
  atomic: true,
  disposition: "eligible",
  reason: "supported",
  evidence: [
    {
      messageId: "source",
      start: 0,
      end: input.source.content.length,
      quote: input.source.content
    }
  ]
};
const context = (): ProcessingContext => ({
  signal: new AbortController().signal,
  deadline: Date.now() + 15000,
  correlationId: "run",
  configuration: resolveProcessingConfiguration(
    apiEnvSchema.parse({
      OPENAI_API_KEY: "fake",
      TYPESAFE_API_KEY: "fake",
      MEMORY_EXTRACTION_SYSTEM: "system_1"
    })
  ),
  beforeCall: vi.fn().mockResolvedValue(undefined)
});
describe("privacy: memory processing contracts", () => {
  it.each(["system_1", "system_2"])(
    "resolves extraction %s independently of consolidation",
    (extraction) => {
      for (const consolidation of ["system_1", "system_2"]) {
        const config = resolveProcessingConfiguration(
          apiEnvSchema.parse({
            OPENAI_API_KEY: "fake",
            TYPESAFE_API_KEY: "fake",
            MEMORY_EXTRACTION_SYSTEM: extraction,
            MEMORY_CONSOLIDATION_SYSTEM: consolidation,
            MEMORY_EXTRACTION_LLM_MODEL: "extract",
            MEMORY_CONSOLIDATION_LLM_MODEL: "judge",
            MEMORY_NORMALIZATION_LLM_MODEL: "normalize"
          })
        );
        expect(config.extraction.system).toBe(extraction);
        expect(config.consolidation.system).toBe(consolidation);
        expect(config.extraction.normalizationModel).toBe("normalize");
        expect(config.consolidation.model).toBe(
          consolidation === "system_1" ? "jev-1.13.0" : "judge"
        );
        expect(JSON.stringify(config)).not.toContain("fake");
      }
    }
  );
  it("supports a credential-free vault and Jev-only consolidation", () => {
    expect(
      resolveProcessingConfiguration(apiEnvSchema.parse({})).extraction
        .available
    ).toBe(false);
    const config = resolveProcessingConfiguration(
      apiEnvSchema.parse({
        TYPESAFE_API_KEY: "fake",
        MEMORY_CONSOLIDATION_SYSTEM: "system_1"
      })
    );
    expect(config.consolidation.available).toBe(true);
    expect(config.extraction.available).toBe(false);
  });
  it("defaults each task to TypeSafe when its required keys exist", () => {
    const both = resolveProcessingConfiguration(
      apiEnvSchema.parse({ OPENAI_API_KEY: "fake", TYPESAFE_API_KEY: "fake" })
    );
    expect(both.extraction.system).toBe("system_1");
    expect(both.consolidation.system).toBe("system_1");
    const explicit = resolveProcessingConfiguration(
      apiEnvSchema.parse({
        OPENAI_API_KEY: "fake",
        TYPESAFE_API_KEY: "fake",
        MEMORY_EXTRACTION_SYSTEM: "system_2"
      })
    );
    expect(explicit.extraction.system).toBe("system_2");
    expect(explicit.consolidation.system).toBe("system_1");
  });
  it("keeps voice extraction identity stable when only consolidation changes", () => {
    const env = apiEnvSchema.parse({
      OPENAI_API_KEY: "fake",
      TYPESAFE_API_KEY: "fake"
    });
    const typesafe = resolveProcessingConfiguration(env);
    const openaiConsolidation = resolveProcessingConfiguration(env, {
      extraction: "system_1",
      consolidation: "system_2"
    });
    expect(openaiConsolidation.extractionFingerprint).toBe(
      typesafe.extractionFingerprint
    );
    expect(openaiConsolidation.fingerprint).not.toBe(typesafe.fingerprint);
  });
  it("rejects explicitly selected dependencies without keys", () => {
    vi.stubEnv("MEMORY_EXTRACTION_SYSTEM", "system_1");
    vi.stubEnv("TYPESAFE_API_KEY", "");
    expect(validateEnvironment).toThrow(/TYPESAFE_API_KEY/);
    vi.unstubAllEnvs();
  });
  it.each(memoryFixtures)(
    "keeps exact UTF-16 source spans for $id",
    (fixture) => {
      for (const span of sourceSpans(fixture.text)) {
        expect(fixture.text.slice(span.start, span.end)).toBe(span.quote);
      }
    }
  );
  it("validates evidence, taxonomy, secrets and ambiguous dates before writes", () => {
    expect(validateCandidate(candidate, input).disposition).toBe("eligible");
    expect(
      validateCandidate(
        { ...candidate, evidence: [{ ...candidate.evidence[0]!, start: 2 }] },
        input
      ).reason
    ).toBe("invalid_source_evidence");
    expect(
      validateCandidate({ ...candidate, categoryKeys: ["invented"] }, input)
        .reason
    ).toBe("unknown_category");
    expect(
      validateCandidate(
        { ...candidate, body: "api_key=synthetic_secret_1234567890" },
        input
      ).reason
    ).toBe("secret_like_content");
    expect(
      validateCandidate(
        {
          ...candidate,
          expiresAt: "2026-02-30T12:00:00Z",
          temporalEvidence: "coffee"
        },
        input
      ).expiresAt
    ).toBeNull();
  });
  it("Jev controls selection and skips normalization for a no-op", async () => {
    const ask = vi
      .fn()
      .mockResolvedValue({ model: "jev-1.13.0", answers: {}, usage: {} });
    const normalize = vi.fn();
    const provider = new JevMemoryExtractionProvider({ ask }, { normalize });
    expect((await provider.extract(input, context())).candidates).toEqual([]);
    expect(normalize).not.toHaveBeenCalled();
  });
  it("rejects unsupported normalized candidates without a fallback", async () => {
    const ask = vi
      .fn()
      .mockResolvedValueOnce({
        model: "jev",
        answers: { "0_remember": { noul: 0.9 } },
        usage: {}
      })
      .mockResolvedValueOnce({
        model: "jev",
        answers: { "0_supported": { noul: 0.2 } },
        usage: {}
      });
    const normalize = vi.fn().mockResolvedValue({
      candidates: [candidate],
      partial: false,
      diagnostics: {}
    });
    const provider = new JevMemoryExtractionProvider({ ask }, { normalize });
    expect(
      (await provider.extract(input, context())).candidates[0]?.disposition
    ).toBe("rejected");
    expect(ask).toHaveBeenCalledTimes(2);
    ask.mockRejectedValueOnce(new Error("outage"));
    await expect(provider.extract(input, context())).rejects.toThrow("outage");
    expect(normalize).toHaveBeenCalledTimes(1);
  });
  it("guards the entire payload and rechecks provider at every stage", async () => {
    const forUser = vi.fn().mockResolvedValue({
      extraction: { processors: ["typesafe", "openai"], available: true }
    });
    const module = await Test.createTestingModule({
      providers: [
        ProcessingPermissionService,
        { provide: MemoryProcessingConfigService, useValue: { forUser } }
      ]
    }).compile();
    const permission = module.get(ProcessingPermissionService);
    await permission.check("user", "extraction", ["typesafe", "openai"], input);
    forUser.mockResolvedValue({
      extraction: { processors: ["openai"], available: true }
    });
    await expect(
      permission.check("user", "extraction", ["typesafe", "openai"], input)
    ).rejects.toThrow("processing_provider_changed");
    await expect(
      permission.check("user", "extraction", ["openai"], {
        context: [
          { content: memoryFixtures.find((f) => f.id === "secret")!.text }
        ]
      })
    ).rejects.toThrow("secret_like_content");
  });
  it("Jev preserves distinct constraints and unresolved conflicts", async () => {
    const ask = vi.fn().mockResolvedValue({
      model: "jev",
      usage: {},
      answers: {
        "0_relationship": { choice: "duplicate", confidence: 0.95 },
        "0_right_loss": { noul: 0.9 },
        "1_relationship": { choice: "conflict", confidence: 0.99 }
      }
    });
    const provider = new JevMemoryConsolidationProvider({ ask });
    const pairs = [0, 1].map((i) => ({
      id: String(i),
      left: { body: "pnpm at home" },
      right: { body: "npm at work" },
      newer: "left" as const
    }));
    expect((await provider.judge({ pairs }, context())).decisions).toEqual([]);
  });
});
