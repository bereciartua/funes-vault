import {
  AuditActorType,
  AuditEventType,
  MemoryKind,
  MemoryStatus,
  PolicyOperation,
  type Prisma,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import type {
  CreateCaptureRequest,
  CreateMemorySuggestionRequest
} from "@funes-vault/shared";

import type { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { assertNoSecretLikeContent } from "../common/secret-like-content.js";
import type { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import {
  quickCapturePurpose,
  quickCaptureSensitivity,
  quickCaptureTitle
} from "./quick-capture.js";
import { quickCaptureConfidence } from "./suggestion.constants.js";
import { createSuggestionRecord } from "./suggestion-records.js";
import { suggestionAuditSubjects } from "./suggestion-subjects.js";
const proposedMemoryId = "proposed_memory";

/** Authorize and record a review-only capture within one transaction. */
export async function captureNote(
  tx: Prisma.TransactionClient,
  auditTrail: AuditTrailService,
  evaluator: PolicyEvaluationService,
  input: {
    userId: string;
    clientId?: string | null;
    body: CreateCaptureRequest;
  }
) {
  const capture = input.body;
  const request: CreateMemorySuggestionRequest = {
    purpose: quickCapturePurpose,
    kind: MemoryKind.FACT,
    title: quickCaptureTitle(capture.text),
    body: capture.text,
    categoryKeys: [],
    sensitivity: quickCaptureSensitivity,
    evidence: null,
    confidence: quickCaptureConfidence,
    expiresAt: null,
    sourceMetadata: {
      channel: quickCapturePurpose,
      ...(capture.captureId ? { captureId: capture.captureId } : {}),
      ...(capture.capturedAt ? { capturedAt: capture.capturedAt } : {})
    }
  };
  assertNoSecretLikeContent(request);

  let policy: Awaited<
    ReturnType<PolicyEvaluationService["evaluateForClient"]>
  > | null = null;
  if (input.clientId) {
    policy = await evaluator.evaluateForClient(
      input.userId,
      {
        clientId: input.clientId,
        operation: PolicyOperation.SUGGEST,
        candidateMemories: [
          {
            id: proposedMemoryId,
            sensitivity: quickCaptureSensitivity,
            status: MemoryStatus.ACTIVE,
            reviewState: ReviewState.APPROVED,
            expiresAt: null,
            categories: []
          }
        ]
      },
      tx
    );

    if (policy.decision === "DENY") {
      const deniedPolicy = policy;
      const event = await auditTrail.createAuditEvent(tx, {
        userId: input.userId,
        clientId: input.clientId,
        type: AuditEventType.MEMORY_SUGGESTION_DENIED,
        actorType: AuditActorType.CLIENT,
        actorId: input.clientId,
        metadata: {
          statedPurpose: quickCapturePurpose,
          policyId: deniedPolicy.policyId,
          policyVersion: deniedPolicy.policyVersion,
          reason: deniedPolicy.reason,
          operation: "SUGGEST"
        }
      });

      return {
        suggestionId: null,
        status: "DENIED" as const,
        auditEventId: event.id,
        deduplicated: false
      };
    }
  }

  if (capture.captureId) {
    const existing = await tx.memorySuggestion.findFirst({
      where: {
        userId: input.userId,
        sourceMetadata: {
          path: ["captureId"],
          equals: capture.captureId
        }
      }
    });

    if (existing) {
      return {
        suggestionId: existing.id,
        status: existing.status,
        auditEventId: null,
        deduplicated: true
      };
    }
  }

  const actor = input.clientId
    ? { type: AuditActorType.CLIENT, id: input.clientId }
    : { type: AuditActorType.USER, id: input.userId };

  const suggestion = await createSuggestionRecord(tx, {
    userId: input.userId,
    sourceType: input.clientId
      ? SourceType.CLIENT_SUGGESTION
      : SourceType.MANUAL,
    sourceClientId: input.clientId ?? null,
    policyId: policy?.policyId,
    serverMetadata: request.sourceMetadata,
    request: { ...request, sourceMetadata: {} }
  });
  const auditEvent = await auditTrail.createAuditEvent(tx, {
    userId: input.userId,
    clientId: input.clientId ?? undefined,
    type: AuditEventType.MEMORY_SUGGESTION_CREATED,
    actorType: actor.type,
    actorId: actor.id,
    metadata: {
      suggestionId: suggestion.id,
      statedPurpose: quickCapturePurpose,
      policyId: policy?.policyId ?? null,
      policyVersion: policy?.policyVersion ?? null,
      reason: policy?.reason ?? null,
      channel: quickCapturePurpose,
      captureId: capture.captureId ?? null,
      capturedAt: capture.capturedAt ?? null,
      clientId: input.clientId ?? null,
      sensitivity: quickCaptureSensitivity
    },
    subjects: suggestionAuditSubjects({
      suggestion,
      clientId: input.clientId ?? null,
      policyId: policy?.policyId ?? null,
      policyLabel: `${policy?.client?.name ?? "App"} permissions`
    })
  });

  return {
    suggestionId: suggestion.id,
    status: suggestion.status,
    auditEventId: auditEvent.id,
    deduplicated: false
  };
}
