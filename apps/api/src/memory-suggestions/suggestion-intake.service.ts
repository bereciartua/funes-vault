import {
  AuditActorType,
  AuditEventType,
  MemoryStatus,
  PolicyOperation,
  type Prisma,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import { appPermissionsLabel } from "@funes-vault/shared";
import {
  type AuditTransport,
  type CreateCaptureRequest,
  type CreateMemorySuggestionRequest,
  type MemorySuggestionResponse
} from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { assertNoSecretLikeContent } from "../common/secret-like-content.js";
import { toDateOrNull } from "../common/serialization.js";
import { CategoriesService } from "../memories/categories.service.js";
import { PolicyEvaluationService } from "../policies/policy-evaluation.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { captureNote } from "./capture-intake.js";
import { toMemorySuggestionResponse } from "./memory-suggestion.mapper.js";
import {
  proposedMemoryId,
  recordSuggestionDenial
} from "./suggestion-denial.js";
import { createSuggestionRecord } from "./suggestion-records.js";
import { suggestionAuditSubjects } from "./suggestion-subjects.js";
import { SuggestionWriterService } from "./suggestion-writer.service.js";

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
    serverMetadata?: Record<string, unknown>;
    body: CreateMemorySuggestionRequest;
  }): Promise<MemorySuggestionResponse> {
    if (!input.transaction) {
      const response = await this.writer.inTransaction(undefined, (tx) =>
        this.createSuggestion({ ...input, transaction: tx })
      );
      if (response.memoryId) {
        await this.writer.enqueueEmbeddingGeneration(
          input.userId,
          response.memoryId
        );
      }

      return response;
    }
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
    const writePolicy = input.reviewOnly
      ? null
      : await this.policyEvaluationService.evaluateForClient(
          input.userId,
          {
            clientId: input.clientId,
            operation: PolicyOperation.WRITE,
            candidateMemories: [proposedMemory]
          },
          input.transaction
        );

    if (writePolicy?.decision === "ALLOW" && !input.reviewOnly) {
      return this.writer.createDirectMemoryFromSuggestion({
        userId: input.userId,
        clientId: input.clientId,
        transport: input.transport ?? "http_api",
        request,
        transaction: input.transaction,
        policyVersion: writePolicy.policyVersion,
        policyLabel: appPermissionsLabel(writePolicy.client?.name ?? "App"),
        serverMetadata: input.serverMetadata,
        policyId: writePolicy.policyId
      });
    }

    const policy = await this.policyEvaluationService.evaluateForClient(
      input.userId,
      {
        clientId: input.clientId,
        operation: PolicyOperation.SUGGEST,
        candidateMemories: [proposedMemory]
      },
      input.transaction
    );

    if (policy.decision === "DENY") {
      const event = await recordSuggestionDenial(
        input.transaction,
        this.auditTrail,
        {
          userId: input.userId,
          clientId: input.clientId,
          statedPurpose: request.purpose,
          policy
        }
      );

      return {
        suggestionId: null,
        memoryId: null,
        status: "DENIED" as const,
        policyId: policy.policyId,
        auditEventId: event.id,
        reason: policy.reason,
        decision: policy.decision,
        denied: policy.denied
      };
    }

    return this.writer.inTransaction(input.transaction, async (tx) => {
      const suggestion = await createSuggestionRecord(tx, {
        userId: input.userId,
        sourceType: SourceType.CLIENT_SUGGESTION,
        sourceClientId: input.clientId,
        policyId: policy.policyId,
        serverMetadata: input.serverMetadata,
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
          policyVersion: policy.policyVersion,
          statedPurpose: request.purpose,
          reason: policy.reason,
          kind: request.kind,
          sensitivity: request.sensitivity,
          categoryKeys: request.categoryKeys,
          confidence: request.confidence,
          expiresAt: request.expiresAt,
          caller: request.sourceMetadata,
          requiresConfirmation: policy.requiresConfirmation
        },
        subjects: suggestionAuditSubjects({
          suggestion,
          clientId: input.clientId,
          policyId: policy.policyId,
          policyLabel: appPermissionsLabel(policy.client?.name ?? "App")
        })
      });

      return {
        suggestionId: suggestion.id,
        memoryId: null,
        status: suggestion.status,
        policyId: policy.policyId,
        auditEventId: auditEvent.id,
        reason: policy.reason,
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
          statedPurpose: request.purpose,
          policyId: null,
          policyVersion: null,
          reason: null,
          kind: request.kind,
          sensitivity: request.sensitivity,
          categoryKeys: request.categoryKeys,
          confidence: request.confidence,
          expiresAt: request.expiresAt,
          caller: request.sourceMetadata
        },
        subjects: suggestionAuditSubjects({
          suggestion: created,
          clientId: null,
          policyId: null,
          policyLabel: null
        })
      });

      return created;
    });

    return { suggestion: toMemorySuggestionResponse(suggestion) };
  }

  createCapture(input: {
    userId: string;
    clientId?: string | null;
    body: CreateCaptureRequest;
  }) {
    return this.prisma.client.$transaction((tx) =>
      captureNote(tx, this.auditTrail, this.policyEvaluationService, input)
    );
  }
}
