import type { MemoryRequest, Prisma } from "@funes-vault/db";
import { NotFoundException } from "@nestjs/common";

import type { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";

/** Live owner-scoped permissions and candidates for a bound disclosure. */
export async function disclosureContext(
  evaluator: PolicyEvaluationService,
  tx: Prisma.TransactionClient,
  request: MemoryRequest,
  ids: string[]
) {
  const gate = await evaluator.evaluateForClient(
    request.userId,
    {
      clientId: request.clientId,
      operation: "READ"
    },
    tx
  );
  const memories =
    gate.decision === "DENY" || !request.policyId
      ? []
      : await tx.memory.findMany({
          where: { id: { in: ids }, userId: request.userId },
          include: { categories: true }
        });
  const evaluation = await evaluator.evaluateForClient(
    request.userId,
    {
      clientId: request.clientId,
      operation: "READ",
      candidateMemories: memories
    },
    tx
  );
  const bound =
    request.policyId !== null && request.policyId === evaluation.policyId;
  const allowed = new Set(bound ? evaluation.allowedMemoryIds : []);

  return {
    client: evaluation.client!,
    policy: evaluation.policy,
    memories,
    allowed,
    bound,
    policyVersion: evaluation.policyVersion
  };
}

export async function lockDisclosureRequest(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
  clientId?: string
) {
  // Serialize decisions and consumption of this one-time grant. Every lookup
  // is scoped to its owner, and result retrieval also checks the exact client.
  await tx.$queryRaw`SELECT id FROM "MemoryRequest" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`;
  const request = await tx.memoryRequest.findFirst({
    where: { id, userId, ...(clientId ? { clientId } : {}) }
  });
  if (!request) {
    throw new NotFoundException("Memory request not found.");
  }

  return request;
}
