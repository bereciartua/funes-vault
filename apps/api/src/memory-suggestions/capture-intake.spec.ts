import {
  AuditEventType,
  MemoryKind,
  MemorySensitivity,
  MemorySuggestionStatus,
  PolicyOperation,
  SourceType
} from "@funes-vault/db";
import { createCaptureRequestSchema } from "@funes-vault/shared";
import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";

import { createSuggestion } from "../../test/factories/index.js";
import { createCaptureHarness } from "../../test/fixtures/suggestions.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";

describe("privacy: MemorySuggestionsService.createCapture", () => {
  let prismaClient: Awaited<
    ReturnType<typeof createCaptureHarness>
  >["prismaClient"];
  let policyEvaluationService: Awaited<
    ReturnType<typeof createCaptureHarness>
  >["policyEvaluationService"];
  let provenance: Awaited<
    ReturnType<typeof createCaptureHarness>
  >["provenance"];
  let service: Awaited<ReturnType<typeof createCaptureHarness>>["service"];
  beforeEach(async () => {
    ({ prismaClient, policyEvaluationService, provenance, service } =
      await createCaptureHarness());
  });

  it("queues a capture-only suggestion for a session user without policy evaluation", async () => {
    const response = await service.intake.createCapture({
      userId: "user_1",
      body: createCaptureRequestSchema.parse({
        text: "Ask the dentist about the retainer next visit.",
        captureId: "capture-0001",
        capturedAt: "2026-07-03T08:12:00.000Z"
      })
    });

    expect(response).toEqual({
      suggestionId: "suggestion_1",
      status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
      auditEventId: "audit_1",
      deduplicated: false
    });
    expect(policyEvaluationService.evaluateForClient).not.toHaveBeenCalled();
    expect(prismaClient.memorySuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        sourceType: SourceType.MANUAL,
        sourceClientId: null,
        suggestedKind: MemoryKind.FACT,
        suggestedSensitivity: MemorySensitivity.INTERNAL,
        title: "Ask the dentist about the retainer next visit.",
        status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
        sourceMetadata: expect.objectContaining({
          channel: "quick_capture",
          captureId: "capture-0001",
          capturedAt: "2026-07-03T08:12:00.000Z"
        })
      })
    });
    expect(prismaClient.memory.create).not.toHaveBeenCalled();
    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        type: AuditEventType.MEMORY_SUGGESTION_CREATED,
        actorType: "USER",
        actorId: "user_1",
        metadata: expect.objectContaining({
          channel: "quick_capture",
          captureId: "capture-0001"
        })
      })
    );
  });
  it("is idempotent by captureId", async () => {
    prismaClient.memorySuggestion.findFirst.mockResolvedValue(
      createSuggestion()
    );

    const response = await service.intake.createCapture({
      userId: "user_1",
      body: createCaptureRequestSchema.parse({
        text: "Ask the dentist about the retainer next visit.",
        captureId: "capture-0001"
      })
    });

    expect(response).toEqual({
      suggestionId: "suggestion_1",
      status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
      auditEventId: null,
      deduplicated: true
    });
    expect(prismaClient.memorySuggestion.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        sourceMetadata: { path: ["captureId"], equals: "capture-0001" }
      }
    });
    expect(prismaClient.memorySuggestion.create).not.toHaveBeenCalled();
    expect(provenance.createAuditEvent).not.toHaveBeenCalled();
  });
  it("evaluates suggest policy for client captures and never writes memory directly", async () => {
    const response = await service.intake.createCapture({
      userId: "user_1",
      clientId: "client_1",
      body: createCaptureRequestSchema.parse({
        text: "Prefers window seats on long flights."
      })
    });

    expect(response.status).toBe(MemorySuggestionStatus.QUEUED_FOR_REVIEW);
    expect(policyEvaluationService.evaluateForClient).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        clientId: "client_1",
        operation: PolicyOperation.SUGGEST
      }),
      expect.anything()
    );
    expect(prismaClient.memory.create).not.toHaveBeenCalled();
    expect(prismaClient.memorySuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: SourceType.CLIENT_SUGGESTION,
        sourceClientId: "client_1",
        status: MemorySuggestionStatus.QUEUED_FOR_REVIEW
      })
    });
    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorType: "CLIENT",
        actorId: "client_1"
      })
    );
  });
  it("denies client captures when policy denies suggest access", async () => {
    policyEvaluationService.evaluateForClient.mockResolvedValue({
      decision: "DENY",
      policyId: null,
      allowedMemoryIds: [],
      denied: [{ memoryId: "proposed_memory", reason: "no_client_policy" }],
      requiresConfirmation: true,
      reason: "no_client_policy"
    });

    const response = await service.intake.createCapture({
      userId: "user_1",
      clientId: "client_1",
      body: createCaptureRequestSchema.parse({
        text: "Prefers window seats on long flights."
      })
    });

    expect(response).toEqual({
      suggestionId: null,
      status: "DENIED",
      auditEventId: "audit_1",
      deduplicated: false
    });
    expect(prismaClient.memorySuggestion.create).not.toHaveBeenCalled();
    expect(provenance.createAuditEvent).toHaveBeenCalled();
  });
  it("blocks secret-like capture text", async () => {
    await expect(
      service.intake.createCapture({
        userId: "user_1",
        body: createCaptureRequestSchema.parse({
          text: "access_token=ghp_abcdefghijklmnopqrstuvwxyz123456"
        })
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaClient.memorySuggestion.findFirst).not.toHaveBeenCalled();
    expect(prismaClient.memorySuggestion.create).not.toHaveBeenCalled();
  });
  it("rejects invalid capture bodies at the HTTP boundary", () => {
    expect(() =>
      new ZodValidationPipe(createCaptureRequestSchema).transform({ text: "" })
    ).toThrow(BadRequestException);
  });
});
