import {
  AuditEventType,
  MemorySensitivity,
  MemoryStatus,
  MemorySuggestionStatus,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import {
  createMemorySuggestionRequestSchema,
  listMemorySuggestionsQuerySchema
} from "@funes-vault/shared";
import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";

import { createSuggestion } from "../../test/factories/index.js";
import { createSuggestionsHarness } from "../../test/fixtures/suggestions.js";

describe("privacy: MemorySuggestionsService", () => {
  let prismaClient: Awaited<
    ReturnType<typeof createSuggestionsHarness>
  >["prismaClient"];
  let policyEvaluationService: Awaited<
    ReturnType<typeof createSuggestionsHarness>
  >["policyEvaluationService"];
  let provenance: Awaited<
    ReturnType<typeof createSuggestionsHarness>
  >["provenance"];
  let service: Awaited<ReturnType<typeof createSuggestionsHarness>>["service"];
  beforeEach(async () => {
    ({ prismaClient, policyEvaluationService, provenance, service } =
      await createSuggestionsHarness());
  });

  it("queues a reviewable suggestion and writes an audit event", async () => {
    const response = await service.intake.createSuggestion({
      userId: "user_1",
      clientId: "client_1",
      body: createMemorySuggestionRequestSchema.parse({
        purpose: "software_development",
        kind: "preference",
        title: "Uses TypeScript often",
        body: "The user frequently works in TypeScript projects.",
        categories: ["software_development"],
        confidence: 0.72
      })
    });

    expect(response.status).toBe(MemorySuggestionStatus.QUEUED_FOR_REVIEW);
    expect(
      policyEvaluationService.evaluateForClient.mock.calls.map(
        (call) => call[1].operation
      )
    ).toEqual(["WRITE", "SUGGEST"]);
    expect(policyEvaluationService.evaluateForClient).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        clientId: "client_1",
        candidateMemories: [
          expect.objectContaining({
            id: "proposed_memory",
            sensitivity: MemorySensitivity.LOW,
            categories: [{ key: "software_development" }]
          })
        ]
      }),
      expect.anything()
    );
    expect(prismaClient.memorySuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        sourceClientId: "client_1",
        suggestedKind: "PREFERENCE",
        suggestedCategories: ["software_development"],
        status: MemorySuggestionStatus.QUEUED_FOR_REVIEW
      })
    });
    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        clientId: "client_1",
        type: AuditEventType.MEMORY_SUGGESTION_CREATED,
        metadata: expect.objectContaining({
          suggestionId: "suggestion_1",
          transport: "http_api",
          policyId: "policy_1",
          statedPurpose: "software_development"
        })
      })
    );
  });
  it("records the MCP transport in suggestion audit metadata", async () => {
    await service.intake.createSuggestion({
      userId: "user_1",
      clientId: "client_1",
      transport: "mcp_stdio",
      body: createMemorySuggestionRequestSchema.parse({
        purpose: "software_development",
        kind: "preference",
        title: "Uses TypeScript often",
        body: "The user frequently works in TypeScript projects.",
        categories: ["software_development"]
      })
    });

    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: AuditEventType.MEMORY_SUGGESTION_CREATED,
        metadata: expect.objectContaining({ transport: "mcp_stdio" })
      })
    );
  });
  it("does not create a suggestion when policy denies suggest access", async () => {
    policyEvaluationService.evaluateForClient.mockResolvedValue({
      decision: "DENY",
      policyId: null,
      allowedMemoryIds: [],
      denied: [{ memoryId: "proposed_memory", reason: "no_client_policy" }],
      requiresConfirmation: true,
      reason: "no_client_policy"
    });

    const response = await service.intake.createSuggestion({
      userId: "user_1",
      clientId: "client_1",
      body: createMemorySuggestionRequestSchema.parse({
        purpose: "software_development",
        title: "Uses TypeScript often",
        body: "The user frequently works in TypeScript projects.",
        categoryKeys: ["software_development"]
      })
    });

    expect(response.status).toBe("DENIED");
    expect(prismaClient.memorySuggestion.create).not.toHaveBeenCalled();
    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "MEMORY_SUGGESTION_DENIED" })
    );
  });
  it("blocks secret-like content before creating a suggestion", async () => {
    await expect(
      service.intake.createSuggestion({
        userId: "user_1",
        clientId: "client_1",
        body: createMemorySuggestionRequestSchema.parse({
          purpose: "software_development",
          title: "Credential to remember",
          body: "access_token=ghp_abcdefghijklmnopqrstuvwxyz123456",
          categoryKeys: ["software_development"]
        })
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaClient.memoryCategory.findMany).not.toHaveBeenCalled();
    expect(policyEvaluationService.evaluateForClient).not.toHaveBeenCalled();
    expect(prismaClient.memorySuggestion.create).not.toHaveBeenCalled();
    expect(provenance.createAuditEvent).not.toHaveBeenCalled();
  });
  it("creates an active memory directly when write policy allows it", async () => {
    policyEvaluationService.evaluateForClient.mockResolvedValueOnce({
      decision: "ALLOW",
      policyId: "policy_write",
      allowedMemoryIds: ["proposed_memory"],
      denied: [],
      requiresConfirmation: false,
      reason: null
    });

    const response = await service.intake.createSuggestion({
      userId: "user_1",
      clientId: "client_1",
      body: createMemorySuggestionRequestSchema.parse({
        purpose: "memory_chat",
        kind: "preference",
        title: "Likes focused help",
        body: "The user likes focused implementation help.",
        categoryKeys: ["software_development"],
        confidence: 0.8
      })
    });

    expect(response.status).toBe(MemorySuggestionStatus.APPLIED);
    expect(policyEvaluationService.evaluateForClient).toHaveBeenCalledTimes(1);
    expect(response.suggestionId).toBe("suggestion_1");
    expect(response.memoryId).toBe("memory_1");
    expect(prismaClient.memorySuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: MemorySuggestionStatus.APPLIED
      })
    });
    expect(prismaClient.memory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_1",
        sourceClientId: "client_1",
        sourceType: SourceType.CLIENT_SUGGESTION,
        status: MemoryStatus.ACTIVE,
        reviewState: ReviewState.APPROVED
      }),
      include: expect.any(Object)
    });
  });
  it("queues a first-party chat suggestion without client policy evaluation", async () => {
    const response = await service.intake.createUserSuggestion({
      userId: "user_1",
      body: createMemorySuggestionRequestSchema.parse({
        purpose: "guided_onboarding",
        kind: "preference",
        title: "Uses TypeScript often",
        body: "The user frequently works in TypeScript projects.",
        categoryKeys: ["software_development"],
        confidence: 0.72
      })
    });

    expect(response.suggestion).toEqual(
      expect.objectContaining({
        id: "suggestion_1",
        source: {
          type: SourceType.CHAT,
          clientId: null,
          metadata: {},
          subjects: []
        },
        categoryKeys: ["software_development"]
      })
    );
    expect(policyEvaluationService.evaluateForClient).not.toHaveBeenCalled();
    expect(provenance.createAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        type: AuditEventType.MEMORY_SUGGESTION_CREATED,
        actorId: "user_1",
        metadata: expect.objectContaining({
          suggestionId: "suggestion_1",
          statedPurpose: "guided_onboarding"
        })
      })
    );
  });
  it("lists only suggestions for the current user", async () => {
    const response = await service.review.listUserSuggestions(
      "user_1",
      listMemorySuggestionsQuerySchema.parse({})
    );

    expect(prismaClient.memorySuggestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user_1",
          status: MemorySuggestionStatus.QUEUED_FOR_REVIEW
        }
      })
    );
    expect(response.items).toHaveLength(1);
  });
  it("clamps queued suggestion pages after review actions remove later pages", async () => {
    prismaClient.memorySuggestion.count.mockResolvedValue(26);
    prismaClient.memorySuggestion.findMany.mockResolvedValue([
      createSuggestion({ id: "suggestion_26" })
    ]);

    const response = await service.review.listUserSuggestions(
      "user_1",
      listMemorySuggestionsQuerySchema.parse({
        page: "999",
        limit: "25"
      })
    );

    expect(prismaClient.memorySuggestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user_1",
          status: MemorySuggestionStatus.QUEUED_FOR_REVIEW
        },
        skip: 25,
        take: 25
      })
    );
    expect(response.pagination).toEqual({
      page: 2,
      limit: 25,
      total: 26,
      totalPages: 2
    });
  });
});
