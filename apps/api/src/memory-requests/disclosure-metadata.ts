import type { MemoryRequest } from "@funes-vault/db";
import type { AuditTransport } from "@funes-vault/shared";

/** Identical disclosure metadata for immediate and one-time deliveries. */
export function disclosureMetadata(input: {
  request: MemoryRequest;
  transport: AuditTransport;
  memoryIds: string[];
  estimatedTokens: number;
  denied: Array<{ memoryId: string; reason: string }>;
  oneTimeApproval: boolean;
}) {
  const request = input.request;

  return {
    requestId: request.id,
    clientId: request.clientId,
    operation: "READ",
    task: request.task,
    statedPurpose: request.statedPurpose,
    policyId: request.policyId,
    policyVersion: request.policyVersion,
    decision: "ALLOW",
    reason: null,
    requiresConfirmation: input.oneTimeApproval,
    transport: input.transport,
    requestedCategories: request.requestedCategories,
    retention: request.retention,
    thirdPartyProcessors: request.thirdPartyProcessors,
    tokenBudget: request.tokenBudget,
    estimatedTokens: input.estimatedTokens,
    memoryIds: input.memoryIds,
    denied: input.denied,
    oneTimeApproval: input.oneTimeApproval
  };
}
