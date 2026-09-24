import { createHash } from "node:crypto";

import type { Client, MemoryRequest } from "@funes-vault/db";
import { memoryBundleItemSchema } from "@funes-vault/shared";
import { z } from "zod";

import type { disclosureContext } from "./disclosure-context.js";
export const snapshotSchema = z.object({
  items: z.array(memoryBundleItemSchema),
  versions: z.record(z.string(), z.string()),
  policyId: z.string(),
  policyVersion: z.string(),
  clientVersion: z.string(),
  instructions: z.array(z.string())
});

export function summary(request: MemoryRequest, clientName: string) {
  return {
    id: request.id,
    clientName,
    statedPurpose: request.statedPurpose,
    policyId: request.policyId,
    policyVersion: request.policyVersion,
    reason: request.decisionReason,
    task: request.task,
    status: request.status,
    retention: request.retention,
    thirdPartyProcessors: request.thirdPartyProcessors,
    createdAt: request.createdAt.toISOString()
  };
}

export function clientRevision(client: Client) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        client.id,
        client.name,
        client.trustLevel,
        client.declaredRetention,
        client.tokenHash,
        client.oauthRegistrationId
      ])
    )
    .digest("hex");
}

export const disclosureApprovalTtlMs = 15 * 60_000;

/** Both preview and consumption validate the exact granted versions. */
export function snapshotIsCurrent(
  request: MemoryRequest,
  snapshot: z.infer<typeof snapshotSchema>,
  context: Awaited<ReturnType<typeof disclosureContext>>
) {
  const versions = new Map(
    context.memories.map((memory) => [
      memory.id,
      memory.updatedAt.toISOString()
    ])
  );

  return Boolean(
    request.approvalExpiresAt &&
    request.approvalExpiresAt > new Date() &&
    context.bound &&
    request.policyId === snapshot.policyId &&
    request.policyVersion === snapshot.policyVersion &&
    context.policy?.id === snapshot.policyId &&
    context.policyVersion === snapshot.policyVersion &&
    clientRevision(context.client) === snapshot.clientVersion &&
    snapshot.items.every(
      (item) =>
        context.allowed.has(item.memoryId) &&
        versions.get(item.memoryId) === snapshot.versions[item.memoryId]
    )
  );
}
