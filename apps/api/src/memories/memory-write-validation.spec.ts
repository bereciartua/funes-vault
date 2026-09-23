import { createMemoryRequestSchema } from "@funes-vault/shared";
import { BadRequestException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoriesHarness } from "../../test/fixtures/memories.js";
afterEach(() => vi.unstubAllEnvs());
describe("privacy: MemoriesService", () => {
  let prismaClient: Awaited<
    ReturnType<typeof createMemoriesHarness>
  >["prismaClient"];
  let service: Awaited<ReturnType<typeof createMemoriesHarness>>["service"];
  let embeddingJobs: Awaited<
    ReturnType<typeof createMemoriesHarness>
  >["embeddingJobs"];
  let provenance: Awaited<
    ReturnType<typeof createMemoriesHarness>
  >["provenance"];
  beforeEach(async () => {
    ({ prismaClient, service, embeddingJobs, provenance } =
      await createMemoriesHarness());
  });

  it("rejects unknown categories before writing a memory", async () => {
    prismaClient.memoryCategory.findMany.mockResolvedValue([]);

    await expect(
      service.createMemory(
        "user_1",
        createMemoryRequestSchema.parse({
          kind: "PREFERENCE",
          title: "Prefers concise help",
          body: "The user prefers concise implementation help.",
          categoryKeys: ["missing"]
        })
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaClient.memory.create).not.toHaveBeenCalled();
    expect(provenance.createAuditEvent).not.toHaveBeenCalled();
  });
  it("blocks secret-like content before writing a memory", async () => {
    await expect(
      service.createMemory(
        "user_1",
        createMemoryRequestSchema.parse({
          kind: "FACT",
          title: "Temporary API key",
          body: "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
          categoryKeys: ["software_development"]
        })
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaClient.memoryCategory.findMany).not.toHaveBeenCalled();
    expect(prismaClient.memory.create).not.toHaveBeenCalled();
    expect(provenance.createAuditEvent).not.toHaveBeenCalled();
    expect(embeddingJobs.enqueueMemoryEmbedding).not.toHaveBeenCalled();
  });
});
