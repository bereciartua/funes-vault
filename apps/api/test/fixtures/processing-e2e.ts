import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, vi } from "vitest";

import { ChatGenerationService } from "../../src/chat/chat-generation.service.js";
import { ThreadTitleService } from "../../src/chat/thread-title.service.js";
import { apiEnvSchema } from "../../src/config.js";
import type {
  ExtractionInput,
  ExtractionResult
} from "../../src/memory-processing/contracts.js";
import { ExtractionRunService } from "../../src/memory-processing/extraction-run.service.js";
import { JevMemoryExtractionProvider } from "../../src/memory-processing/jev-memory-extraction.provider.js";
import { LlmMemoryExtractionProvider } from "../../src/memory-processing/llm-memory-extraction.provider.js";
import {
  MemoryProcessingConfigService,
  resolveProcessingConfiguration
} from "../../src/memory-processing/memory-processing-config.service.js";
import {
  createE2eApp,
  createE2ePrismaClient,
  resetTestDatabase
} from "../e2e-harness.js";

export function output(input: ExtractionInput): ExtractionResult {
  return {
    partial: false,
    diagnostics: { model: "fake" },
    candidates: [
      {
        id: "claim_1",
        title: "Concise answers",
        body: "The user prefers concise answers.",
        kind: "PREFERENCE",
        sensitivity: "LOW",
        categoryKeys: ["communication_style"],
        expiresAt: null,
        temporalEvidence: null,
        intent: input.source.content.includes("used to")
          ? "correction"
          : "remember",
        atomic: true,
        disposition: "eligible",
        reason: "supported",
        evidence: [
          {
            messageId: input.source.id,
            start: 0,
            end: input.source.content.length,
            quote: input.source.content
          }
        ]
      }
    ]
  };
}
export function processingE2eHarness() {
  let app: INestApplication;
  let prisma: ReturnType<typeof createE2ePrismaClient>;
  let extraction: ExtractionRunService;
  let llm: ReturnType<typeof vi.spyOn>;
  let jev: ReturnType<typeof vi.spyOn>;
  beforeAll(async () => {
    vi.stubEnv("OPENAI_API_KEY", "fake");
    vi.stubEnv("TYPESAFE_API_KEY", "fake");
    app = await createE2eApp();
    prisma = createE2ePrismaClient();
    extraction = app.get(ExtractionRunService);
    llm = vi.spyOn(app.get(LlmMemoryExtractionProvider), "extract");
    jev = vi.spyOn(app.get(JevMemoryExtractionProvider), "extract");
    vi.spyOn(
      app.get(ChatGenerationService),
      "generateAnswer"
    ).mockResolvedValue({
      answer: "Processing checked.",
      citations: [],
      suggestedMemoryIds: []
    });
    vi.spyOn(
      app.get(ThreadTitleService),
      "maybeUpdateAutomaticThreadTitle"
    ).mockResolvedValue(null);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
    llm.mockReset().mockImplementation(output);
    jev.mockReset().mockImplementation(output);
    await prisma.memoryCategory.upsert({
      where: { key: "communication_style" },
      create: { key: "communication_style", name: "Communication" },
      update: {}
    });
    configure("system_2", "policy");
  });
  function configure(
    system: "system_1" | "system_2",
    writeMode: "policy" | "review",
    consolidation = "system_2"
  ) {
    Object.defineProperty(app.get(MemoryProcessingConfigService), "effective", {
      configurable: true,
      value: resolveProcessingConfiguration(
        apiEnvSchema.parse({
          OPENAI_API_KEY: "fake",
          TYPESAFE_API_KEY: "fake",
          MEMORY_EXTRACTION_SYSTEM: system,
          MEMORY_CONSOLIDATION_SYSTEM: consolidation,
          MEMORY_EXTRACTION_WRITE_MODE: writeMode
        })
      )
    });
  }
  async function source(
    userId: string,
    content = "Remember I prefer concise answers."
  ) {
    const session = await prisma.chatSession.create({ data: { userId } });

    return prisma.chatMessage.create({
      data: { userId, sessionId: session.id, role: "USER", content }
    });
  }

  return () => ({ app, prisma, extraction, llm, jev, configure, source });
}
