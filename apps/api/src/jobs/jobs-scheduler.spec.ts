import { updateConsolidationSettingsRequestSchema } from "@funes-vault/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createJobsHarness,
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
  beforeEach(async () => {
    ({ prismaClient, service } = await createJobsHarness());
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("removes the BullMQ job scheduler when scheduled consolidation is disabled", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    service.getQueue();

    prismaClient.user.update.mockResolvedValue({
      consolidationEnabled: false,
      consolidationMode: "REVIEW_ONLY"
    });

    await service.updateConsolidationSettings(
      "user_1",
      updateConsolidationSettingsRequestSchema.parse({
        enabled: false,
        mode: "REVIEW_ONLY"
      })
    );

    expect(queue.removeJobScheduler).toHaveBeenCalledWith(
      "consolidation-user_1"
    );
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
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
