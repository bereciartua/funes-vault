import {
  MemoryStatus,
  MemorySuggestionStatus,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import { bulkReviewMemorySuggestionsRequestSchema } from "@funes-vault/shared";
import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSuggestion } from "../../test/factories/index.js";
import { createSuggestionsHarness } from "../../test/fixtures/suggestions.js";

describe("privacy: MemorySuggestionsService", () => {
  let prismaClient: Awaited<
    ReturnType<typeof createSuggestionsHarness>
  >["prismaClient"];
  let service: Awaited<ReturnType<typeof createSuggestionsHarness>>["service"];
  beforeEach(async () => {
    ({ prismaClient, service } = await createSuggestionsHarness());
  });

  it("applies a queued suggestion as an active approved memory", async () => {
    const response = await service.review.applyUserSuggestion(
      "user_1",
      "suggestion_1"
    );

    expect(prismaClient.memorySuggestion.findFirst).toHaveBeenCalledWith({
      where: { id: "suggestion_1", userId: "user_1" }
    });
    expect(prismaClient.memory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        status: MemoryStatus.ACTIVE,
        reviewState: ReviewState.APPROVED,
        sourceType: SourceType.CHAT
      }),
      include: expect.any(Object)
    });
    expect(response.memory).toEqual(
      expect.objectContaining({
        id: "memory_1",
        status: MemoryStatus.ACTIVE,
        reviewState: ReviewState.APPROVED
      })
    );
  });
  it("bulk reviews unique suggestions and reports per-item failures", async () => {
    prismaClient.memorySuggestion.findMany.mockResolvedValueOnce([
      createSuggestion({ id: "suggestion_1" }),
      createSuggestion({
        id: "suggestion_bad",
        status: MemorySuggestionStatus.APPLIED
      })
    ]);

    const response = await service.bulk.bulkReviewUserSuggestions(
      "user_1",
      bulkReviewMemorySuggestionsRequestSchema.parse({
        ids: ["suggestion_1", "suggestion_1", "suggestion_bad"],
        action: "apply"
      })
    );

    expect(prismaClient.memorySuggestion.findFirst).not.toHaveBeenCalled();
    expect(prismaClient.memorySuggestion.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["suggestion_1", "suggestion_bad"] },
        userId: "user_1"
      }
    });
    expect(response).toEqual({
      action: "apply",
      requested: 2,
      succeeded: 1,
      failed: 1,
      results: [
        expect.objectContaining({
          id: "suggestion_1",
          status: "applied"
        }),
        {
          id: "suggestion_bad",
          status: "failed",
          error: "Memory suggestion is not reviewable"
        }
      ]
    });
  });
  it("sanitizes internal bulk review failures while preserving review errors", async () => {
    const loggerError = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    prismaClient.memorySuggestion.findMany.mockResolvedValueOnce([
      createSuggestion({ id: "suggestion_internal" }),
      createSuggestion({
        id: "suggestion_bad",
        status: MemorySuggestionStatus.APPLIED
      })
    ]);
    prismaClient.memory.create.mockRejectedValueOnce(
      new Error("SELECT constraint P2002 internal detail")
    );

    const response = await service.bulk.bulkReviewUserSuggestions(
      "user_1",
      bulkReviewMemorySuggestionsRequestSchema.parse({
        ids: ["suggestion_internal", "suggestion_bad"],
        action: "apply"
      })
    );

    expect(prismaClient.memorySuggestion.findFirst).not.toHaveBeenCalled();
    expect(response).toEqual({
      action: "apply",
      requested: 2,
      succeeded: 0,
      failed: 2,
      results: [
        {
          id: "suggestion_internal",
          status: "failed",
          error: "Could not review this suggestion."
        },
        {
          id: "suggestion_bad",
          status: "failed",
          error: "Memory suggestion is not reviewable"
        }
      ]
    });
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining("suggestion_internal"),
      expect.any(String)
    );
    loggerError.mockRestore();
  });
});
