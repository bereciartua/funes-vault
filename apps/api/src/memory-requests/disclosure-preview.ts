import { createHash } from "node:crypto";

import {
  type MemoryRequest,
  MemoryRequestStatus,
  type Prisma
} from "@funes-vault/db";

import type { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import type { BundleCompilerService } from "./bundle-compiler.service.js";
import { disclosureContext } from "./disclosure-context.js";
import {
  clientRevision,
  snapshotSchema,
  summary
} from "./disclosure-snapshot.js";

/** Build an exact preview, invalidating stale authority without reopening consumed requests. */
export async function previewDisclosure(
  tx: Prisma.TransactionClient,
  request: MemoryRequest,
  candidates: Array<{ id: string; relevanceScore: number }>,
  evaluator: PolicyEvaluationService,
  compiler: BundleCompilerService,
  invalidate: (
    tx: Prisma.TransactionClient,
    request: MemoryRequest
  ) => Promise<void>
) {
  const context = await disclosureContext(
    evaluator,
    tx,
    request,
    candidates.map((c) => c.id)
  );
  if (
    [
      MemoryRequestStatus.NEEDS_USER_APPROVAL,
      MemoryRequestStatus.APPROVED
    ].some((status) => status === request.status) &&
    request.policyId &&
    (!context.bound || request.policyVersion !== context.policyVersion)
  ) {
    await invalidate(tx, request);
    request.status = MemoryRequestStatus.NEEDS_USER_APPROVAL;
    request.decisionReason = "policy_changed";
    // A fresh preview may adopt the new version of the same policy, never a new policy.
    if (context.bound) {
      request.policyVersion = context.policyVersion;
      await tx.memoryRequest.update({
        where: { id: request.id },
        data: { policyVersion: context.policyVersion }
      });
    }
  }
  const byId = new Map(context.memories.map((m) => [m.id, m]));
  const approved = candidates.flatMap((c) => {
    const memory = byId.get(c.id);

    return memory && context.allowed.has(c.id)
      ? [{ ...memory, relevanceScore: c.relevanceScore }]
      : [];
  });
  const bundle = compiler.compile({
    candidates: approved,
    tokenBudget: request.tokenBudget
  });
  const versions = Object.fromEntries(
    approved.map((m) => [m.id, m.updatedAt.toISOString()])
  );
  const snapshot = {
    items: bundle.items,
    versions,
    instructions: bundle.instructions,
    policyId: context.policy?.id ?? "",
    policyVersion: context.policy?.updatedAt.toISOString() ?? "",
    clientVersion: clientRevision(context.client)
  };
  if (request.status === MemoryRequestStatus.APPROVED) {
    const previous = snapshotSchema.safeParse(request.reviewSnapshot);
    if (
      !previous.success ||
      !request.approvalExpiresAt ||
      request.approvalExpiresAt <= new Date() ||
      previous.data.clientVersion !== snapshot.clientVersion ||
      previous.data.items.some(
        (item) =>
          !context.allowed.has(item.memoryId) ||
          versions[item.memoryId] !== previous.data.versions[item.memoryId]
      )
    ) {
      await invalidate(tx, request);
      request.status = MemoryRequestStatus.NEEDS_USER_APPROVAL;
      request.decisionReason = "policy_changed";
    }
  }
  const revision = createHash("sha256")
    .update(JSON.stringify({ requestId: request.id, ...snapshot }))
    .digest("hex");

  return {
    snapshot,
    preview: {
      request: summary(request, context.client.name),
      revision,
      items: bundle.items,
      canApprove:
        request.status === MemoryRequestStatus.NEEDS_USER_APPROVAL &&
        context.bound &&
        bundle.items.length > 0
    }
  };
}
