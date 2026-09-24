import type { ChatMessage, MemoryExtractionRun } from "@funes-vault/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiEnvSchema } from "../config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ExtractionProviderService } from "./extraction-provider.service.js";
import { JevMemoryExtractionProvider } from "./jev-memory-extraction.provider.js";
import { LlmMemoryExtractionProvider } from "./llm-memory-extraction.provider.js";
import { resolveProcessingConfiguration } from "./memory-processing-config.service.js";
import { ProcessingPermissionService } from "./processing-permission.service.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("privacy: voice source finalization eligibility", () => {
  function setup(arrived: string, fingerprint?: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T14:00:00Z"));
    vi.stubEnv("OPENAI_API_KEY", "fake");
    const config = resolveProcessingConfiguration(
      apiEnvSchema.parse({ OPENAI_API_KEY: "fake" })
    );
    const prisma = {
      client: {
        voiceSession: {
          findFirst: vi.fn().mockResolvedValue({
            endedAt: new Date("2026-09-22T12:00:00Z"),
            extractionFingerprint: fingerprint
          })
        },
        chatMessage: { findMany: vi.fn().mockResolvedValue([]) },
        memoryCategory: { findMany: vi.fn().mockResolvedValue([]) }
      }
    };
    const service = new ExtractionProviderService(
      prisma as unknown as PrismaService,
      {} as ProcessingPermissionService,
      {} as LlmMemoryExtractionProvider,
      {} as JevMemoryExtractionProvider
    );
    const source = {
      id: "source",
      userId: "owner",
      sessionId: "thread",
      voiceSessionId: "voice",
      content: "I prefer quiet rooms.",
      createdAt: new Date(arrived)
    } as ChatMessage;

    return {
      prisma,
      prepare: () =>
        service.prepareInput(
          "owner",
          source,
          { fingerprint: config.fingerprint } as MemoryExtractionRun,
          config,
          "voice"
        )
    };
  }
  it.each(["2026-09-22T11:59:00Z", "2026-09-22T12:01:00Z"])(
    "allows a later retry of a source received at %s",
    async (arrived) => {
      const { prepare, prisma } = setup(arrived);
      expect(await prepare()).toMatchObject({
        source: { id: "source" },
        channel: "voice"
      });
      expect(prisma.client.voiceSession.findFirst).toHaveBeenCalledWith({
        where: { id: "voice", userId: "owner" }
      });
    }
  );
  it("rejects a transcript received beyond the grace period", async () => {
    await expect(setup("2026-09-22T12:01:00.001Z").prepare()).rejects.toThrow(
      "voice_transcript_arrived_too_late"
    );
  });
  it("continues rejecting a changed processing configuration", async () => {
    await expect(
      setup("2026-09-22T11:59:00Z", "different").prepare()
    ).rejects.toThrow("reconnect_voice_session");
  });
});
