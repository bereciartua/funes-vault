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
  snapshotIsCurrent,
  snapshotSchema,
  summary
} from "./disclosure-snapshot.js";

/** Approved previews inspect only the granted snapshot and never change its state. */
export async function previewDisclosure(input: {
  tx: Prisma.TransactionClient;
  request: MemoryRequest;
  candidates: Array<{ id: string; relevanceScore: number }>;
  evaluator: PolicyEvaluationService;
  compiler: BundleCompilerService;
  invalidate: (
    tx: Prisma.TransactionClient,
    request: MemoryRequest,
    context: Awaited<ReturnType<typeof disclosureContext>>
  ) => Promise<MemoryRequest>;
}) {
  const { tx, candidates, evaluator, compiler, invalidate } = input;
  let request = input.request;
  const previous = snapshotSchema.safeParse(request.reviewSnapshot);
  const isApproved = request.status === MemoryRequestStatus.APPROVED;
  const ids = isApproved
    ? previous.success
      ? previous.data.items.map((item) => item.memoryId)
      : []
    : candidates.map((c) => c.id);
  const context = await disclosureContext(evaluator, tx, request, ids);
  if (
    request.status === MemoryRequestStatus.NEEDS_USER_APPROVAL &&
    request.policyId &&
    (!context.bound || request.policyVersion !== context.policyVersion)
  ) {
    request = await invalidate(tx, request, context);
  }
  const byId = new Map(context.memories.map((m) => [m.id, m]));
  const eligible = candidates.flatMap((c) => {
    const memory = byId.get(c.id);

    return memory && context.allowed.has(c.id)
      ? [{ ...memory, relevanceScore: c.relevanceScore }]
      : [];
  });
  const bundle = compiler.compile({
    candidates: eligible,
    tokenBudget: request.tokenBudget
  });
  const snapshot = {
    items: bundle.items,
    versions: Object.fromEntries(
      eligible.map((m) => [m.id, m.updatedAt.toISOString()])
    ),
    instructions: bundle.instructions,
    policyId: context.policy?.id ?? "",
    policyVersion: context.policyVersion ?? "",
    clientVersion: clientRevision(context.client)
  };
  if (isApproved && previous.success) {
    // A preview cannot revoke an approval when retrieval availability or ranking changes.
    const unchanged = snapshotIsCurrent(request, previous.data, context);
    snapshot.items = unchanged
      ? previous.data.items.map((item) => ({
          ...item,
          relevanceScore: item.relevanceScore ?? 0
        }))
      : [];
    snapshot.versions = previous.data.versions;
    snapshot.instructions = previous.data.instructions;
  }

  return {
    snapshot,
    preview: {
      request: summary(request, context.client.name),
      approvalExpired: Boolean(
        isApproved &&
        (!request.approvalExpiresAt || request.approvalExpiresAt <= new Date())
      ),
      revision: createHash("sha256")
        .update(JSON.stringify({ requestId: request.id, ...snapshot }))
        .digest("hex"),
      items: snapshot.items,
      canApprove:
        request.status === MemoryRequestStatus.NEEDS_USER_APPROVAL &&
        context.bound &&
        snapshot.items.length > 0
    }
  };
}
