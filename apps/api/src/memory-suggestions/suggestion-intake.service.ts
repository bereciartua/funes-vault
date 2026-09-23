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
import {
  type AuditTransport,
  type CreateCaptureRequest,
  type CreateMemorySuggestionRequest
} from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { assertNoSecretLikeContent } from "../common/secret-like-content.js";
import { toDateOrNull } from "../common/serialization.js";
import { CategoriesService } from "../memories/categories.service.js";
import { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toMemorySuggestionResponse } from "./memory-suggestion.mapper.js";
import {
  quickCapturePurpose,
  quickCaptureSensitivity,
  quickCaptureTitle
} from "./quick-capture.js";
import { quickCaptureConfidence } from "./suggestion.constants.js";
import { createSuggestionRecord } from "./suggestion-records.js";
import { suggestionAuditSubjects } from "./suggestion-subjects.js";
import { SuggestionWriterService } from "./suggestion-writer.service.js";
const proposedMemoryId = "proposed_memory";

/**
 * Normalizes owner/client suggestion and capture intake, checks category and secret rules, and
 * evaluates write policy. The writer persists a reviewed suggestion or authorized memory;
 * captures always require review.
 */
@Injectable()
export class SuggestionIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService,
    private readonly policyEvaluationService: PolicyEvaluationService,
    private readonly categories: CategoriesService,
    private readonly writer: SuggestionWriterService
  ) {}

  async createSuggestion(input: {
    userId: string;
    clientId: string;
    transport?: AuditTransport;
    transaction?: Prisma.TransactionClient;
    reviewOnly?: boolean;
    body: CreateMemorySuggestionRequest;
  }) {
    const request = input.body;
    assertNoSecretLikeContent(request);
    await this.categories.assertExist(request.categoryKeys);
    const proposedMemory = {
      id: proposedMemoryId,
      sensitivity: request.sensitivity,
      status: MemoryStatus.ACTIVE,
      reviewState: ReviewState.APPROVED,
      expiresAt: toDateOrNull(request.expiresAt),
      categories: request.categoryKeys.map((key) => ({ key }))
    };
    const writePolicy = await this.policyEvaluationService.evaluateForClient(
      input.userId,
      {
        clientId: input.clientId,
        purpose: request.purpose,
        operation: PolicyOperation.WRITE,
        candidateMemories: [proposedMemory]
      }
    );

    if (writePolicy.decision === "ALLOW" && !input.reviewOnly) {
      return this.writer.createDirectMemoryFromSuggestion({
        userId: input.userId,
        clientId: input.clientId,
        transport: input.transport ?? "http_api",
        request,
        transaction: input.transaction,
        policyId: writePolicy.policyId
      });
    }

    const policy = await this.policyEvaluationService.evaluateForClient(
      input.userId,
      {
        clientId: input.clientId,
        purpose: request.purpose,
        operation: PolicyOperation.SUGGEST,
        candidateMemories: [proposedMemory]
      }
    );

    if (policy.decision === "DENY") {
      return {
        suggestionId: null,
        memoryId: null,
        status: "DENIED" as const,
        policyId: policy.policyId,
        auditEventId: null,
        decision: policy.decision,
        denied: policy.denied
      };
    }

    return this.writer.inTransaction(input.transaction, async (tx) => {
      const suggestion = await createSuggestionRecord(tx, {
        userId: input.userId,
        sourceType: SourceType.CLIENT_SUGGESTION,
        sourceClientId: input.clientId,
        request
      });
      const auditEvent = await this.auditTrail.createAuditEvent(tx, {
        userId: input.userId,
        clientId: input.clientId,
        type: AuditEventType.MEMORY_SUGGESTION_CREATED,
        actorType: AuditActorType.CLIENT,
        actorId: input.clientId,
        metadata: {
          suggestionId: suggestion.id,
          clientId: input.clientId,
          transport: input.transport ?? "http_api",
          policyId: policy.policyId,
          purpose: request.purpose,
          kind: request.kind,
          sensitivity: request.sensitivity,
          categoryKeys: request.categoryKeys,
          confidence: request.confidence,
          expiresAt: request.expiresAt,
          sourceMetadata: request.sourceMetadata,
          requiresConfirmation: policy.requiresConfirmation
        },
        subjects: suggestionAuditSubjects({
          suggestion,
          clientId: input.clientId,
          policyId: policy.policyId,
          policyLabel: request.purpose
        })
      });

      return {
        suggestionId: suggestion.id,
        memoryId: null,
        status: suggestion.status,
        policyId: policy.policyId,
        auditEventId: auditEvent.id,
        decision: policy.decision,
        denied: policy.denied
      };
    });
  }

  async createUserSuggestion(input: {
    userId: string;
    body: CreateMemorySuggestionRequest;
  }) {
    const request = input.body;
    assertNoSecretLikeContent(request);
    await this.categories.assertExist(request.categoryKeys);

    const suggestion = await this.prisma.client.$transaction(async (tx) => {
      const created = await createSuggestionRecord(tx, {
        userId: input.userId,
        sourceType: SourceType.CHAT,
        sourceClientId: null,
        request
      });

      await this.auditTrail.createAuditEvent(tx, {
        userId: input.userId,
        type: AuditEventType.MEMORY_SUGGESTION_CREATED,
        actorType: AuditActorType.USER,
        actorId: input.userId,
        metadata: {
          suggestionId: created.id,
          purpose: request.purpose,
          kind: request.kind,
          sensitivity: request.sensitivity,
          categoryKeys: request.categoryKeys,
          confidence: request.confidence,
          expiresAt: request.expiresAt,
          sourceMetadata: request.sourceMetadata
        },
        subjects: suggestionAuditSubjects({
          suggestion: created,
          clientId: null,
          policyId: null,
          policyLabel: request.purpose
        })
      });

      return created;
    });

    return { suggestion: toMemorySuggestionResponse(suggestion) };
  }

  async createCapture(input: {
    userId: string;
    clientId?: string | null;
    body: CreateCaptureRequest;
  }) {
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

    if (capture.captureId) {
      const existing = await this.prisma.client.memorySuggestion.findFirst({
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

    if (input.clientId) {
      const policy = await this.policyEvaluationService.evaluateForClient(
        input.userId,
        {
          clientId: input.clientId,
          purpose: quickCapturePurpose,
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
        }
      );

      if (policy.decision === "DENY") {
        return {
          suggestionId: null,
          status: "DENIED" as const,
          auditEventId: null,
          deduplicated: false
        };
      }
    }

    const actor = input.clientId
      ? { type: AuditActorType.CLIENT, id: input.clientId }
      : { type: AuditActorType.USER, id: input.userId };

    return this.prisma.client.$transaction(async (tx) => {
      const suggestion = await createSuggestionRecord(tx, {
        userId: input.userId,
        sourceType: input.clientId
          ? SourceType.CLIENT_SUGGESTION
          : SourceType.MANUAL,
        sourceClientId: input.clientId ?? null,
        request
      });
      const auditEvent = await this.auditTrail.createAuditEvent(tx, {
        userId: input.userId,
        clientId: input.clientId ?? undefined,
        type: AuditEventType.MEMORY_SUGGESTION_CREATED,
        actorType: actor.type,
        actorId: actor.id,
        metadata: {
          suggestionId: suggestion.id,
          channel: quickCapturePurpose,
          captureId: capture.captureId ?? null,
          capturedAt: capture.capturedAt ?? null,
          clientId: input.clientId ?? null,
          sensitivity: quickCaptureSensitivity
        },
        subjects: suggestionAuditSubjects({
          suggestion,
          clientId: input.clientId ?? null,
          policyId: null,
          policyLabel: quickCapturePurpose
        })
      });

      return {
        suggestionId: suggestion.id,
        status: suggestion.status,
        auditEventId: auditEvent.id,
        deduplicated: false
      };
    });
  }
}
