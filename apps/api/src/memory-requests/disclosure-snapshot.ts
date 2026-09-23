import { createHash } from "node:crypto";

import type { Client, MemoryRequest } from "@funes-vault/db";
import { memoryBundleItemSchema } from "@funes-vault/shared";
import { z } from "zod";
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
    purpose: request.purpose,
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
