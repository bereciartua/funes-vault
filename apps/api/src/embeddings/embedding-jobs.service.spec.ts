import { afterEach, describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { EmbeddingJobsService } from "./embedding-jobs.service.js";
import { EmbeddingsService } from "./embeddings.service.js";

const transport = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue({ id: "bull-job" }),
  close: vi.fn(),
  waitUntilReady: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  process: null as
    | null
    | ((job: {
        data: { userId: string; memoryId: string; jobRunId: string };
      }) => Promise<void>)
}));
vi.mock("bullmq", () => ({
  Queue: class {
    on = transport.on;
    add = transport.add;
    close = transport.close;
    waitUntilReady = transport.waitUntilReady;
  },
  Worker: class {
    close = transport.close;
    waitUntilReady = transport.waitUntilReady;
    on = transport.on;
    constructor(_name: string, handler: NonNullable<typeof transport.process>) {
      transport.process = handler;
    }
  }
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  transport.process = null;
});
async function setup(redis: boolean) {
  vi.stubEnv("REDIS_URL", redis ? "redis://localhost:6379" : undefined);
  vi.stubEnv("JOB_WORKER_ENABLED", "true");
  const jobRun = {
    create: vi.fn().mockResolvedValue({ id: "job" }),
    update: vi.fn()
  };
  const client = {
    jobRun,
    $transaction: vi.fn(
      async (fn: (tx: { jobRun: typeof jobRun }) => Promise<void>) =>
        fn({ jobRun })
    )
  };
  const generateForMemory = vi.fn().mockResolvedValue({ skipped: false });
  const createAuditEvent = vi.fn();
  const service = await createService(EmbeddingJobsService, [
    { provide: PrismaService, useValue: { client } },
    { provide: EmbeddingsService, useValue: { generateForMemory } },
    { provide: AuditTrailService, useValue: { createAuditEvent } }
  ]);
  await service.onModuleInit();

  return { service, jobRun, generateForMemory, createAuditEvent };
}

describe("privacy: embedding job lifecycle", () => {
  it("records cancellation when the queue is unavailable", async () => {
    const { service, jobRun } = await setup(false);
    expect(
      await service.enqueueMemoryEmbedding({
        userId: "owner",
        memoryId: "memory",
        reason: "memory_created"
      })
    ).toEqual({ jobRunId: "job", queued: false });
    expect(jobRun.update).toHaveBeenCalledWith({
      where: { id: "job" },
      data: { status: "CANCELLED", error: "REDIS_URL is not configured" }
    });
    expect(transport.add).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });
  it.each([false, true])(
    "audits worker completion and failure with owner-scoped identifiers (failure=%s)",
    async (failed) => {
      const { service, jobRun, generateForMemory, createAuditEvent } =
        await setup(true);
      await service.enqueueMemoryEmbedding({
        userId: "owner",
        memoryId: "memory",
        reason: "memory_created"
      });
      expect(transport.add).toHaveBeenCalledWith(
        "generate-memory-embedding",
        { userId: "owner", memoryId: "memory", jobRunId: "job" },
        expect.objectContaining({ attempts: 3 })
      );
      if (failed) {
        generateForMemory.mockRejectedValueOnce(
          new Error("provider unavailable")
        );
      }
      const execution = transport.process!({
        data: { userId: "owner", memoryId: "memory", jobRunId: "job" }
      });
      if (failed) {
        await expect(execution).rejects.toThrow("provider unavailable");
      } else {
        await execution;
      }
      expect(jobRun.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: "job" },
          data: expect.objectContaining({
            status: failed ? "FAILED" : "SUCCEEDED"
          })
        })
      );
      expect(createAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: "owner",
          actorId: "job",
          type: failed ? "JOB_FAILED" : "JOB_COMPLETED"
        })
      );
      await service.onModuleDestroy();
      expect(transport.close).toHaveBeenCalledTimes(2);
    }
  );
});
