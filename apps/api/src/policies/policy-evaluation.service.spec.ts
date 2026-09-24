import {
  ClientTrustLevel,
  MemorySensitivity,
  MemoryStatus,
  PolicyOperation,
  ReviewState
} from "@funes-vault/db";
import { describe, expect, it, vi } from "vitest";

import { createService } from "../../test/mocks/create-service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  evaluateCandidateMemories,
  PolicyEvaluationService
} from "./policy-evaluation.service.js";

const now = new Date("2026-06-27T12:00:00.000Z");

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "memory_1",
    sensitivity: MemorySensitivity.LOW,
    status: MemoryStatus.ACTIVE,
    reviewState: ReviewState.APPROVED,
    expiresAt: null,
    categories: [{ key: "software_development" }],
    ...overrides
  };
}

function policy(overrides: Record<string, unknown> = {}) {
  return {
    id: "policy_1",
    updatedAt: new Date(),
    maxSensitivity: MemorySensitivity.INTERNAL,
    operations: [PolicyOperation.READ],
    requiresConfirmation: false,
    expiresAt: null,
    allowedCategories: [{ key: "software_development" }],
    deniedCategories: [],
    ...overrides
  };
}

describe("privacy: PolicyEvaluationService", () => {
  it("allows memories matching category and sensitivity rules", () => {
    const result = evaluateCandidateMemories({
      policy: policy(),
      candidateMemories: [candidate()],
      now
    });

    expect(result.decision).toBe("ALLOW");
    expect(result.allowedMemoryIds).toEqual(["memory_1"]);
    expect(result.denied).toEqual([]);
  });

  it("treats an empty allow-list as covering every category", () => {
    // The Apps & access UI documents an empty allow-list as "from every
    // category"; enforcement must match what the user was told.
    const result = evaluateCandidateMemories({
      policy: policy({ allowedCategories: [] }),
      candidateMemories: [
        candidate(),
        candidate({ id: "memory_2", categories: [] })
      ],
      now
    });

    expect(result.decision).toBe("ALLOW");
    expect(result.allowedMemoryIds).toEqual(["memory_1", "memory_2"]);
    expect(result.denied).toEqual([]);
  });

  it("still applies denied categories when the allow-list is empty", () => {
    const result = evaluateCandidateMemories({
      policy: policy({
        allowedCategories: [],
        deniedCategories: [{ key: "software_development" }]
      }),
      candidateMemories: [candidate()],
      now
    });

    expect(result.decision).toBe("DENY");
    expect(result.denied).toEqual([
      { memoryId: "memory_1", reason: "denied_category" }
    ]);
  });

  it("denies uncategorized memories under a non-empty allow-list", () => {
    const result = evaluateCandidateMemories({
      policy: policy(),
      candidateMemories: [candidate({ categories: [] })],
      now
    });

    expect(result.decision).toBe("DENY");
    expect(result.denied).toEqual([
      { memoryId: "memory_1", reason: "category_not_allowed" }
    ]);
  });

  it("lets denied categories override allowed categories", () => {
    const result = evaluateCandidateMemories({
      policy: policy({
        allowedCategories: [{ key: "software_development" }],
        deniedCategories: [{ key: "software_development" }]
      }),
      candidateMemories: [candidate()],
      now
    });

    expect(result.decision).toBe("DENY");
    expect(result.denied).toEqual([
      { memoryId: "memory_1", reason: "denied_category" }
    ]);
  });

  it("denies memories above the policy sensitivity ceiling", () => {
    const result = evaluateCandidateMemories({
      policy: policy({ maxSensitivity: MemorySensitivity.LOW }),
      candidateMemories: [
        candidate({ sensitivity: MemorySensitivity.SENSITIVE })
      ],
      now
    });

    expect(result.decision).toBe("DENY");
    expect(result.denied).toEqual([
      { memoryId: "memory_1", reason: "above_sensitivity_ceiling" }
    ]);
  });

  it("denies every candidate when the policy is expired", () => {
    const result = evaluateCandidateMemories({
      policy: policy({ expiresAt: new Date("2026-06-26T12:00:00.000Z") }),
      candidateMemories: [candidate()],
      now
    });

    expect(result.decision).toBe("DENY");
    expect(result.reason).toBe("policy_expired");
    expect(result.denied).toEqual([]);
  });

  it("denies unknown clients by default", async () => {
    const prismaClient = {
      client: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    };
    const service = await createService(PolicyEvaluationService, [
      {
        provide: PrismaService,
        useValue: {
          client: prismaClient
        }
      }
    ]);

    const result = await service.evaluateForClient("user_1", {
      clientId: "missing_client",
      operation: PolicyOperation.READ,
      candidateMemories: [candidate()],
      now
    });

    expect(result.decision).toBe("DENY");
    expect(result.reason).toBe("unknown_or_blocked_client");
    expect(result.requiresConfirmation).toBe(true);
  });

  it("requires confirmation when an otherwise matching policy says so", () => {
    const result = evaluateCandidateMemories({
      policy: policy({ requiresConfirmation: true }),
      candidateMemories: [candidate()],
      now
    });

    expect(result.decision).toBe("NEEDS_CONFIRMATION");
    expect(result.allowedMemoryIds).toEqual(["memory_1"]);
  });

  it("denies blocked clients even when they have policies", async () => {
    const prismaClient = {
      client: {
        findFirst: vi.fn().mockResolvedValue({
          id: "client_1",
          trustLevel: ClientTrustLevel.BLOCKED,
          policies: [policy()]
        })
      }
    };
    const service = await createService(PolicyEvaluationService, [
      {
        provide: PrismaService,
        useValue: {
          client: prismaClient
        }
      }
    ]);

    const result = await service.evaluateForClient("user_1", {
      clientId: "client_1",
      operation: PolicyOperation.READ,
      candidateMemories: [candidate()],
      now
    });

    expect(result.decision).toBe("DENY");
    expect(result.reason).toBe("unknown_or_blocked_client");
  });
});
