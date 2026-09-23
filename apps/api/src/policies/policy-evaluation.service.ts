import {
  ClientTrustLevel,
  type MemoryCategory,
  MemorySensitivity,
  MemoryStatus,
  type Policy,
  PolicyOperation,
  ReviewState
} from "@funes-vault/db";
import { sensitivityRank } from "@funes-vault/shared/domain";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service.js";
import { policyInclude } from "./policy.types.js";

type CandidateMemory = {
  id: string;
  sensitivity: MemorySensitivity;
  status: MemoryStatus;
  reviewState: ReviewState;
  expiresAt: Date | null;
  categories: Pick<MemoryCategory, "key">[];
};

type EvaluationPolicy = Pick<
  Policy,
  "id" | "maxSensitivity" | "operations" | "requiresConfirmation" | "expiresAt"
> & {
  allowedCategories: Pick<MemoryCategory, "key">[];
  deniedCategories: Pick<MemoryCategory, "key">[];
};

type PolicyEvaluationInput = {
  clientId: string;
  purpose: string;
  operation: PolicyOperation;
  candidateMemories: CandidateMemory[];
  now?: Date;
};

export type PolicyEvaluationResult = {
  decision: "ALLOW" | "NEEDS_CONFIRMATION" | "DENY";
  policyId: string | null;
  allowedMemoryIds: string[];
  denied: Array<{ memoryId: string; reason: string }>;
  requiresConfirmation: boolean;
  reason: string | null;
};

/**
 * Owns pure policy evaluation for candidate memories.
 * Tenant boundary: caller supplies the owner-filtered policies and candidates.
 * Audit: pure evaluation; callers record decisions.
 */
@Injectable()
export class PolicyEvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateForClient(
    userId: string,
    input: PolicyEvaluationInput
  ): Promise<PolicyEvaluationResult> {
    const now = input.now ?? new Date();
    const client = await this.prisma.client.client.findFirst({
      where: { id: input.clientId, userId },
      include: {
        policies: {
          where: { purpose: input.purpose },
          include: policyInclude,
          orderBy: { updatedAt: "desc" }
        }
      }
    });

    if (!client || client.trustLevel === ClientTrustLevel.BLOCKED) {
      return this.denyAll(input.candidateMemories, "unknown_or_blocked_client");
    }

    const policy = client.policies.find(
      (candidate) =>
        candidate.operations.includes(input.operation) &&
        (!candidate.expiresAt || candidate.expiresAt > now)
    );

    if (!policy) {
      return this.denyAll(input.candidateMemories, "no_active_policy");
    }

    return evaluateCandidateMemories({
      policy,
      candidateMemories: input.candidateMemories,
      now
    });
  }

  private denyAll(
    candidateMemories: CandidateMemory[],
    reason: string
  ): PolicyEvaluationResult {
    return {
      decision: "DENY",
      policyId: null,
      allowedMemoryIds: [],
      denied: candidateMemories.map((memory) => ({
        memoryId: memory.id,
        reason
      })),
      requiresConfirmation: true,
      reason
    };
  }
}

export function evaluateCandidateMemories(input: {
  policy: EvaluationPolicy;
  candidateMemories: CandidateMemory[];
  now?: Date;
}): PolicyEvaluationResult {
  const now = input.now ?? new Date();

  if (input.policy.expiresAt && input.policy.expiresAt <= now) {
    return {
      decision: "DENY",
      policyId: input.policy.id,
      allowedMemoryIds: [],
      denied: input.candidateMemories.map((memory) => ({
        memoryId: memory.id,
        reason: "expired_policy"
      })),
      requiresConfirmation: true,
      reason: "expired_policy"
    };
  }

  const allowedCategories = new Set(
    input.policy.allowedCategories.map((category) => category.key)
  );
  const deniedCategories = new Set(
    input.policy.deniedCategories.map((category) => category.key)
  );
  const allowedMemoryIds: string[] = [];
  const denied: Array<{ memoryId: string; reason: string }> = [];

  for (const memory of input.candidateMemories) {
    const categoryKeys = memory.categories.map((category) => category.key);
    const reason = denialReason({
      memory,
      categoryKeys,
      allowedCategories,
      deniedCategories,
      maxSensitivity: input.policy.maxSensitivity,
      now
    });

    if (reason) {
      denied.push({ memoryId: memory.id, reason });
    } else {
      allowedMemoryIds.push(memory.id);
    }
  }

  return {
    decision:
      allowedMemoryIds.length === 0
        ? "DENY"
        : input.policy.requiresConfirmation
          ? "NEEDS_CONFIRMATION"
          : "ALLOW",
    policyId: input.policy.id,
    allowedMemoryIds,
    denied,
    requiresConfirmation: input.policy.requiresConfirmation,
    reason: allowedMemoryIds.length === 0 ? "no_allowed_memories" : null
  };
}

function denialReason(input: {
  memory: CandidateMemory;
  categoryKeys: string[];
  allowedCategories: Set<string>;
  deniedCategories: Set<string>;
  maxSensitivity: MemorySensitivity;
  now: Date;
}) {
  if (input.memory.status !== MemoryStatus.ACTIVE) {
    return "inactive_memory";
  }

  if (input.memory.reviewState !== ReviewState.APPROVED) {
    return "unapproved_memory";
  }

  if (input.memory.expiresAt && input.memory.expiresAt <= input.now) {
    return "expired_memory";
  }

  if (
    sensitivityRank[input.memory.sensitivity] >
    sensitivityRank[input.maxSensitivity]
  ) {
    return "above_sensitivity_ceiling";
  }

  if (input.categoryKeys.some((key) => input.deniedCategories.has(key))) {
    return "denied_category";
  }

  // An empty allow-list means the policy covers every category (matching
  // the Apps & access UI and policy summaries); a non-empty allow-list
  // grants only the listed categories.
  if (
    input.allowedCategories.size > 0 &&
    !input.categoryKeys.some((key) => input.allowedCategories.has(key))
  ) {
    return "category_not_allowed";
  }

  return null;
}
