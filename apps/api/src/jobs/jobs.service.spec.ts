import {
  AuditEventType,
  JobStatus,
  JobType,
  MemoryStatus,
  SourceType
} from "@funes-vault/db";
import {
  listJobsQuerySchema,
  updateConsolidationSettingsRequestSchema
} from "@funes-vault/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemory } from "../../test/factories/index.js";
import {
  createJobRun,
  createJobsHarness,
  mockConsolidationMemoryStore,
  mockedGenerateText,
  queue
} from "../../test/fixtures/consolidation-jobs.js";
afterEach(() => vi.unstubAllEnvs());
afterEach(() => {
  queue.upsertJobScheduler.mockClear();
  queue.removeJobScheduler.mockClear();
});
describe("JobsService consolidation", () => {
  let prismaClient: Awaited<
    ReturnType<typeof createJobsHarness>
  >["prismaClient"];
  let service: Awaited<ReturnType<typeof createJobsHarness>>["service"];
  let runner: Awaited<ReturnType<typeof createJobsHarness>>["runner"];
  let provenance: Awaited<ReturnType<typeof createJobsHarness>>["provenance"];
  beforeEach(async () => {
    ({ prismaClient, service, runner, provenance } = await createJobsHarness());
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("clamps current-user job stream pages with active filters", async () => {
    prismaClient.jobRun.count.mockResolvedValue(26);
    prismaClient.jobRun.findMany.mockResolvedValue([
      createJobRun({ id: "job_26", status: JobStatus.FAILED })
    ]);

    const response = await service.listJobs(
      "user_1",
      listJobsQuerySchema.parse({
        page: "999",
        limit: "25",
        status: JobStatus.FAILED
      })
    );

    expect(prismaClient.jobRun.count).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        type: undefined,
        status: JobStatus.FAILED
      }
    });
    expect(prismaClient.jobRun.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        type: undefined,
        status: JobStatus.FAILED
      },
      orderBy: { createdAt: "desc" },
      skip: 25,
      take: 25
    });
    expect(response.pagination).toEqual({
      page: 2,
      limit: 25,
      total: 26,
      totalPages: 2
    });
  });
  it("queues consolidation archive suggestions in review-only mode", async () => {
    prismaClient.user.findUniqueOrThrow.mockResolvedValue({
      consolidationMode: "REVIEW_ONLY"
    });

    const result = await runner.runConsolidation({
      userId: "user_1",
      jobRunId: "job_1"
    });

    expect(result.type).toBe(JobType.CONSOLIDATE_MEMORIES);
    expect(result.candidateCount).toBe(2);
    expect(result.suggestionIds).toHaveLength(2);
    expect(result.appliedMemoryIds).toEqual([]);
    expect(prismaClient.memorySuggestion.create).toHaveBeenCalledTimes(2);
    expect(prismaClient.memory.update).not.toHaveBeenCalled();
    expect(prismaClient.$executeRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.arrayContaining(["user_1", expect.any(Date)])
      })
    );
    expect(prismaClient.memorySuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: SourceType.CONSOLIDATION,
        sourceMetadata: expect.objectContaining({
          action: "archive_memory",
          mode: "REVIEW_ONLY"
        })
      })
    });
  });
  it("auto-applies every consolidation archive output in auto-apply mode", async () => {
    prismaClient.user.findUniqueOrThrow.mockResolvedValue({
      consolidationMode: "AUTO_APPLY"
    });

    const result = await runner.runConsolidation({
      userId: "user_1",
      jobRunId: "job_1"
    });

    expect(result.candidateCount).toBe(2);
    expect(result.suggestionIds).toEqual([]);
    expect(result.appliedMemoryIds).toEqual([
      "expired_memory",
      "duplicate_memory"
    ]);
    expect(prismaClient.memorySuggestion.create).not.toHaveBeenCalled();
    expect(prismaClient.memory.update).toHaveBeenCalledTimes(2);
    expect(prismaClient.memory.update).toHaveBeenCalledWith({
      where: { id: "expired_memory" },
      data: { status: MemoryStatus.EXPIRED }
    });
    expect(prismaClient.memory.update).toHaveBeenCalledWith({
      where: { id: "duplicate_memory" },
      data: { status: MemoryStatus.ARCHIVED }
    });
    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: AuditEventType.MEMORY_ARCHIVED,
        actorId: "job_1",
        metadata: expect.objectContaining({
          action: "archive_memory",
          mode: "AUTO_APPLY"
        })
      })
    );
  });
  it("ignores memories touched by non-consolidation-relevant updates", async () => {
    const systemTouchedMemory = createMemory({
      id: "system_touched_memory",
      updatedAt: new Date("2026-06-27T12:45:00.000Z"),
      consolidationRelevantAt: new Date("2026-06-20T12:00:00.000Z"),
      lastConsolidatedAt: null
    });

    prismaClient.user.findUniqueOrThrow.mockResolvedValue({
      consolidationMode: "REVIEW_ONLY"
    });
    mockConsolidationMemoryStore(prismaClient, [systemTouchedMemory]);

    const result = await runner.runConsolidation({
      userId: "user_1",
      jobRunId: "job_1"
    });

    expect(result.inspectedMemories).toBe(0);
    expect(result.candidateCount).toBe(0);
    expect(result.suggestionIds).toEqual([]);
    expect(prismaClient.memorySuggestion.create).not.toHaveBeenCalled();
    expect(prismaClient.$executeRaw).not.toHaveBeenCalled();
  });
  it("does not re-inspect a memory version that was already consolidated", async () => {
    const alreadyConsolidatedMemory = createMemory({
      id: "already_consolidated_memory",
      updatedAt: new Date("2026-06-27T12:50:00.000Z"),
      consolidationRelevantAt: new Date("2026-06-27T12:30:00.000Z"),
      lastConsolidatedAt: new Date("2026-06-27T12:40:00.000Z")
    });

    prismaClient.user.findUniqueOrThrow.mockResolvedValue({
      consolidationMode: "REVIEW_ONLY"
    });
    mockConsolidationMemoryStore(prismaClient, [alreadyConsolidatedMemory]);

    const result = await runner.runConsolidation({
      userId: "user_1",
      jobRunId: "job_1"
    });

    expect(result.inspectedMemories).toBe(0);
    expect(result.candidateCount).toBe(0);
    expect(result.suggestionIds).toEqual([]);
    expect(prismaClient.memorySuggestion.create).not.toHaveBeenCalled();
    expect(prismaClient.$executeRaw).not.toHaveBeenCalled();
  });
  it("uses recent related memories and the LLM to propose conflict archive suggestions", async () => {
    const now = new Date();
    const blueMemory = createMemory({
      id: "blue_memory",
      title: "Favorite color is blue",
      body: "The user's favorite color is blue.",
      createdAt: new Date(now.getTime() - 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 60 * 60 * 1000)
    });
    const orangeMemory = createMemory({
      id: "orange_memory",
      title: "Favorite color is orange",
      body: "The user's favorite color is orange.",
      createdAt: now,
      updatedAt: now
    });
    const coffeeMemory = createMemory({
      id: "coffee_memory",
      title: "Likes coffee",
      body: "The user likes coffee.",
      createdAt: now,
      updatedAt: now
    });

    vi.stubEnv("OPENAI_API_KEY", "test-key");
    prismaClient.user.findUniqueOrThrow.mockResolvedValue({
      consolidationMode: "REVIEW_ONLY"
    });
    mockConsolidationMemoryStore(prismaClient, [
      orangeMemory,
      coffeeMemory,
      blueMemory
    ]);
    mockedGenerateText.mockResolvedValue({
      response: { modelId: "test" },
      usage: {},
      output: {
        decisions: [
          {
            pairId: "pair_0",
            archive: "left",
            reason: "conflict",
            confidence: 0.91,
            evidence:
              "The newer memory says the favorite color is orange, which conflicts with the older blue preference."
          }
        ]
      }
    } as never);

    const result = await runner.runConsolidation({
      userId: "user_1",
      jobRunId: "job_1"
    });

    expect(mockedGenerateText).toHaveBeenCalledTimes(1);
    expect(result.candidateCount).toBe(1);
    expect(result.suggestionIds).toEqual(["conflict_suggestion"]);
    expect(result.appliedMemoryIds).toEqual([]);
    expect(prismaClient.memorySuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        evidence:
          "The newer memory says the favorite color is orange, which conflicts with the older blue preference.",
        confidence: 0.91,
        sourceMetadata: expect.objectContaining({
          action: "archive_memory",
          reason: "conflict",
          targetMemoryId: "blue_memory",
          canonicalMemoryId: "orange_memory"
        })
      })
    });
  });
  it("upserts a BullMQ job scheduler when scheduled consolidation is enabled", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    service.getQueue();

    prismaClient.user.update.mockResolvedValue({
      consolidationEnabled: true,
      consolidationMode: "REVIEW_ONLY"
    });

    await service.updateConsolidationSettings(
      "user_1",
      updateConsolidationSettingsRequestSchema.parse({
        enabled: true,
        mode: "REVIEW_ONLY"
      })
    );

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      "consolidation-user_1",
      { pattern: "0 3 * * *" },
      expect.objectContaining({
        name: "scheduled-consolidation",
        data: { userId: "user_1", trigger: "scheduled" },
        opts: expect.objectContaining({
          attempts: 3,
          removeOnComplete: 100,
          removeOnFail: 500
        })
      })
    );
  });
});

vi.mock("bullmq", () => ({
  Queue: class {
    on = vi.fn();
    upsertJobScheduler = queue.upsertJobScheduler;
    removeJobScheduler = queue.removeJobScheduler;
  }
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn((model: string) => ({ model }))
}));
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn((input) => input)
  }
}));
