import {
  ClientTrustLevel,
  type MemoryCategory,
  MemorySensitivity,
  MemoryStatus,
  type Policy,
  PolicyOperation,
  type Prisma,
  ReviewState
} from "@funes-vault/db";
import { MemoryRequestReason } from "@funes-vault/shared";
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
export type PolicyEvaluationResult = {
  decision: "ALLOW" | "NEEDS_CONFIRMATION" | "DENY";
  policyId: string | null;
  allowedMemoryIds: string[];
  denied: Array<{ memoryId: string; reason: MemoryRequestReason }>;
  requiresConfirmation: boolean;
  reason: MemoryRequestReason | null;
};

/** Owner-scoped authority gate; pure candidate filtering is safe only after this check. Never consumes caller purpose. */
@Injectable()
export class PolicyEvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateForClient(
    userId: string,
    input: {
      clientId: string;
      operation: PolicyOperation;
      now?: Date;
      candidateMemories?: CandidateMemory[];
    },
    db: Pick<Prisma.TransactionClient, "client"> = this.prisma.client
  ) {
    const now = input.now ?? new Date();
    const client = await db.client.findFirst({
      where: { id: input.clientId, userId },
      include: { policies: { include: policyInclude } }
    });
    const policy = client?.policies[0] ?? null;
    const reason =
      !client || client.trustLevel === ClientTrustLevel.BLOCKED
        ? MemoryRequestReason.unknown_or_blocked_client
        : !policy
          ? MemoryRequestReason.no_client_policy
          : policy.expiresAt && policy.expiresAt <= now
            ? MemoryRequestReason.policy_expired
            : !policy.operations.includes(input.operation)
              ? MemoryRequestReason.operation_not_allowed
              : null;
    const authority = {
      client,
      policy,
      policyVersion: policy?.updatedAt.toISOString() ?? null
    };
    if (reason || !policy) {
      return {
        ...authority,
        decision: "DENY" as const,
        policyId: policy?.id ?? null,
        allowedMemoryIds: [],
        denied: [],
        requiresConfirmation: policy?.requiresConfirmation ?? false,
        reason
      };
    }
    const result: PolicyEvaluationResult =
      input.candidateMemories === undefined
        ? {
            decision: "ALLOW",
            policyId: policy.id,
            allowedMemoryIds: [],
            denied: [],
            requiresConfirmation: policy.requiresConfirmation,
            reason: null
          }
        : evaluateCandidateMemories({
            policy,
            candidateMemories: input.candidateMemories,
            now
          });

    return { ...authority, ...result };
  }
}

export function evaluateCandidateMemories(input: {
  policy: EvaluationPolicy;
  candidateMemories: CandidateMemory[];
  now?: Date;
}): PolicyEvaluationResult {
  const now = input.now ?? new Date();
  const allowedCategories = new Set(
    input.policy.allowedCategories.map((c) => c.key)
  );
  const deniedCategories = new Set(
    input.policy.deniedCategories.map((c) => c.key)
  );
  const allowedMemoryIds: string[] = [];
  const denied: PolicyEvaluationResult["denied"] = [];
  for (const memory of input.candidateMemories) {
    const reason = denialReason({
      memory,
      categoryKeys: memory.categories.map((c) => c.key),
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
  const reason =
    input.candidateMemories.length === 0
      ? MemoryRequestReason.no_matching_memories
      : allowedMemoryIds.length === 0
        ? MemoryRequestReason.no_allowed_memories
        : input.policy.requiresConfirmation
          ? MemoryRequestReason.confirmation_required
          : null;

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
    reason
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
    return MemoryRequestReason.inactive_memory;
  }

  if (input.memory.reviewState !== ReviewState.APPROVED) {
    return MemoryRequestReason.unapproved_memory;
  }

  if (input.memory.expiresAt && input.memory.expiresAt <= input.now) {
    return MemoryRequestReason.expired_memory;
  }

  if (
    sensitivityRank[input.memory.sensitivity] >
    sensitivityRank[input.maxSensitivity]
  ) {
    return MemoryRequestReason.above_sensitivity_ceiling;
  }

  if (input.categoryKeys.some((key) => input.deniedCategories.has(key))) {
    return MemoryRequestReason.denied_category;
  }

  // An empty allow-list means the policy covers every category (matching
  // the Apps & access UI and policy summaries); a non-empty allow-list
  // grants only the listed categories.
  if (
    input.allowedCategories.size > 0 &&
    !input.categoryKeys.some((key) => input.allowedCategories.has(key))
  ) {
    return MemoryRequestReason.category_not_allowed;
  }

  return null;
}
