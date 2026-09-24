import { MemoryStatus, MemorySuggestionStatus } from "@funes-vault/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { FirstPartyAccessService } from "../first-party-access/first-party-access.service.js";
import { MemoriesService } from "../memories/memories.service.js";
import { MemoryRequestsService } from "../memory-requests/memory-requests.service.js";
import { SuggestionIntakeService } from "../memory-suggestions/suggestion-intake.service.js";
import { SuggestionReviewService } from "../memory-suggestions/suggestion-review.service.js";
import { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ChatMemoryToolsService } from "./chat-memory-tools.service.js";

describe("privacy: ChatMemoryToolsService", () => {
  const firstPartyAccess = {
    ensureWebChatAccess: vi.fn(),
    ensureVoiceAccess: vi.fn()
  };
  const prisma = {
    client: {
      memory: { findFirst: vi.fn() },
      memorySuggestion: { findFirst: vi.fn() }
    }
  };
  const memorySuggestionsService = {
    createSuggestion: vi.fn()
  };
  const evaluator = { evaluateForClient: vi.fn() };
  let service: ChatMemoryToolsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    evaluator.evaluateForClient.mockResolvedValue({
      decision: "ALLOW",
      policyId: null
    });
    firstPartyAccess.ensureWebChatAccess.mockResolvedValue({
      clientId: "client_chat"
    });
    firstPartyAccess.ensureVoiceAccess.mockResolvedValue({
      clientId: "client_voice"
    });
    prisma.client.memory.findFirst.mockResolvedValue(null);
    prisma.client.memorySuggestion.findFirst.mockResolvedValue(null);
    memorySuggestionsService.createSuggestion.mockResolvedValue({
      suggestionId: "suggestion_new",
      memoryId: "memory_new",
      status: MemorySuggestionStatus.APPLIED,
      policyId: "policy_write",
      auditEventId: "audit_new",
      decision: "ALLOW",
      denied: []
    });
    service = await createService(ChatMemoryToolsService, [
      {
        provide: PolicyEvaluationService,
        useValue: evaluator
      },
      { provide: FirstPartyAccessService, useValue: firstPartyAccess },
      { provide: PrismaService, useValue: prisma },
      { provide: MemoryRequestsService, useValue: {} },
      { provide: SuggestionIntakeService, useValue: memorySuggestionsService },
      { provide: SuggestionReviewService, useValue: memorySuggestionsService },
      { provide: MemoriesService, useValue: {} }
    ]);
  });

  const input = {
    userId: "user_1",
    title: "Likes biking around Reston",
    body: "The user likes to bike around Reston.",
    kind: "PREFERENCE",
    sensitivity: "LOW",
    categoryKeys: ["location_preferences"],
    evidence: "The user said they like to bike around Reston.",
    confidence: 0.9,
    expiresAt: null
  };

  it("returns an existing active memory instead of writing it again", async () => {
    prisma.client.memory.findFirst.mockResolvedValue({
      id: "memory_existing"
    });

    const response = await service.suggestMemory(input);

    expect(response).toEqual({
      suggestionId: null,
      memoryId: "memory_existing",
      status: MemorySuggestionStatus.APPLIED,
      policyId: null,
      reason: null,
      auditEventId: null,
      decision: "ALLOW",
      denied: [],
      deduplicated: true
    });
    expect(prisma.client.memory.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
        status: MemoryStatus.ACTIVE,
        title: {
          equals: "Likes biking around Reston",
          mode: "insensitive"
        },
        body: {
          equals: "The user likes to bike around Reston.",
          mode: "insensitive"
        },
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }]
      },
      select: { id: true }
    });
    expect(prisma.client.memorySuggestion.findFirst).not.toHaveBeenCalled();
    expect(memorySuggestionsService.createSuggestion).not.toHaveBeenCalled();
  });

  it("returns an existing queued suggestion instead of queuing it again", async () => {
    prisma.client.memorySuggestion.findFirst.mockResolvedValue({
      id: "suggestion_existing"
    });

    const response = await service.suggestMemory(input);

    expect(response).toEqual(
      expect.objectContaining({
        suggestionId: "suggestion_existing",
        memoryId: null,
        status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
        decision: "NEEDS_CONFIRMATION",
        deduplicated: true
      })
    );
    expect(memorySuggestionsService.createSuggestion).not.toHaveBeenCalled();
  });

  it("creates a suggestion when the claim is new", async () => {
    const response = await service.suggestMemory(input);

    expect(memorySuggestionsService.createSuggestion).toHaveBeenCalledWith({
      userId: "user_1",
      clientId: "client_chat",
      reviewOnly: false,
      body: expect.objectContaining({
        purpose: "memory_chat",
        title: input.title,
        body: input.body
      })
    });
    expect(response).toEqual(
      expect.objectContaining({
        memoryId: "memory_new",
        deduplicated: false
      })
    );
  });
  it("does not deduplicate before checking removed permissions", async () => {
    evaluator.evaluateForClient.mockResolvedValue({
      decision: "DENY",
      reason: "no_client_policy",
      policyId: null
    });
    memorySuggestionsService.createSuggestion.mockResolvedValue({
      decision: "DENY",
      reason: "no_client_policy"
    });
    expect(await service.suggestMemory(input)).toMatchObject({
      decision: "DENY",
      reason: "no_client_policy"
    });
    expect(prisma.client.memory.findFirst).not.toHaveBeenCalled();
    expect(prisma.client.memorySuggestion.findFirst).not.toHaveBeenCalled();
  });

  it("keeps voice proposals review-only even when the app has WRITE", async () => {
    await service.suggestMemory({ ...input, channel: "voice" });
    expect(memorySuggestionsService.createSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client_voice", reviewOnly: true })
    );
  });
});
