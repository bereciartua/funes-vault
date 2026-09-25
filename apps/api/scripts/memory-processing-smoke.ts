import "../src/env.js";

import { detectSecretLikeContent } from "../src/common/secret-like-content.js";
import {
  JevMemoryConsolidationProvider,
  LlmMemoryConsolidationProvider
} from "../src/consolidation/consolidation.providers.js";
import type { ProcessingContext } from "../src/memory-processing/contracts.js";
import { JevMemoryExtractionProvider } from "../src/memory-processing/jev-memory-extraction.provider.js";
import {
  LlmMemoryExtractionProvider,
  MemoryTextNormalizer
} from "../src/memory-processing/llm-memory-extraction.provider.js";
import { resolveProcessingConfiguration } from "../src/memory-processing/memory-processing-config.service.js";
import { TypeSafeTransport } from "../src/memory-processing/typesafe.transport.js";
import { memoryFixtures } from "../test/fixtures/memory-processing.js";
const configuration = resolveProcessingConfiguration();
const task =
  process.argv[2] === "consolidation" ? "consolidation" : "extraction";
if (!configuration[task].available) {
  throw new Error(
    "Configure credentials and task selection before running the opt-in live smoke command."
  );
}
const transport = new TypeSafeTransport();
const normalizer = new MemoryTextNormalizer();
const fixtureId = process.argv[3] ?? "preference";
const fixtures =
  fixtureId === "all"
    ? memoryFixtures
    : memoryFixtures.filter((f) => f.id === fixtureId);
for (const fixture of task === "consolidation"
  ? memoryFixtures.slice(0, 1)
  : fixtures) {
  const started = Date.now();
  const context: ProcessingContext = {
    signal: AbortSignal.timeout(configuration[task].timeoutMs),
    deadline: Date.now() + configuration[task].timeoutMs,
    correlationId: fixture.id,
    configuration,
    beforeCall: (payload) => {
      if (detectSecretLikeContent({ body: JSON.stringify(payload) }).length) {
        throw new Error("synthetic_secret_blocked");
      }

      return Promise.resolve();
    }
  };
  try {
    const output =
      task === "extraction"
        ? await (
            configuration.extraction.system === "system_1"
              ? new JevMemoryExtractionProvider(transport, normalizer)
              : new LlmMemoryExtractionProvider(normalizer)
          ).extract(
            {
              source: { id: fixture.id, content: fixture.text },
              channel: "chat",
              context: [],
              now: new Date().toISOString(),
              timezone: "America/New_York",
              categories: [
                {
                  key: "communication_style",
                  name: "Communication preferences",
                  description: "Tone and format"
                },
                {
                  key: "software_development",
                  name: "Software development",
                  description: "Tools and coding"
                },
                {
                  key: "project_context",
                  name: "Personal context",
                  description: "Other personal facts and preferences"
                }
              ]
            },
            context
          )
        : await (
            configuration.consolidation.system === "system_1"
              ? new JevMemoryConsolidationProvider(transport)
              : new LlmMemoryConsolidationProvider()
          ).judge(
            {
              pairs: [
                {
                  id: "pair_0",
                  left: {
                    title: "Concise answers",
                    body: "The user prefers concise technical answers."
                  },
                  right: {
                    title: "Concise help",
                    body: "The user prefers brief technical answers."
                  },
                  newer: "left"
                }
              ]
            },
            context
          );
    console.log(
      JSON.stringify({
        fixture: fixture.id,
        expected: fixture.expected,
        task,
        fingerprint: configuration.fingerprint,
        elapsedMs: Date.now() - started,
        output
      })
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        fixture: fixture.id,
        task,
        elapsedMs: Date.now() - started,
        failed: true,
        category:
          error instanceof Error && error.message === "synthetic_secret_blocked"
            ? "secret_blocked"
            : "provider_unavailable"
      })
    );
    process.exitCode = 1;
  }
}
