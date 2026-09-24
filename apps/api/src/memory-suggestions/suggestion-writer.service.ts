import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  MemoryProvenanceEntryType,
  MemorySuggestionStatus,
  type Prisma,
  SourceType
} from "@funes-vault/db";
import {
  type AuditTransport,
  type CreateMemorySuggestionRequest
} from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { EmbeddingJobsService } from "../embeddings/embedding-jobs.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  createMemoryFromSuggestion,
  createSuggestionRecord
} from "./suggestion-records.js";
import {
  suggestionAuditSubjects,
  suggestionProvenanceSubjects
} from "./suggestion-subjects.js";

/**
 * Persists an authorized memory or queued suggestion in the caller’s transaction with creation
 * audit and provenance. Intake owns policy and content validation; embedding work is enqueued
 * after durable application.
 */
@Injectable()
export class SuggestionWriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService,
    private readonly embeddingJobs: EmbeddingJobsService
  ) {}

  async createDirectMemoryFromSuggestion(input: {
    userId: string;
    clientId: string;
    transport: AuditTransport;
    request: CreateMemorySuggestionRequest;
    policyId: string | null;
    policyVersion: string | null;
    policyLabel: string;
    serverMetadata?: Record<string, unknown>;
    transaction: Prisma.TransactionClient;
  }) {
    const { suggestion, memory, auditEvent } = await this.inTransaction(
      input.transaction,
      async (tx) => {
        const createdSuggestion = await createSuggestionRecord(tx, {
          userId: input.userId,
          sourceType: SourceType.CLIENT_SUGGESTION,
          sourceClientId: input.clientId,
          request: input.request,
          policyId: input.policyId,
          serverMetadata: { ...input.serverMetadata, directWrite: true },
          status: MemorySuggestionStatus.APPLIED
        });
        const createdMemory = await createMemoryFromSuggestion(
          tx,
          createdSuggestion,
          { policyId: input.policyId, directWrite: true }
        );
        const suggestionAuditEvent = await this.auditTrail.createAuditEvent(
          tx,
          {
            userId: input.userId,
            clientId: input.clientId,
            type: AuditEventType.MEMORY_SUGGESTION_CREATED,
            actorType: AuditActorType.CLIENT,
            actorId: input.clientId,
            metadata: {
              suggestionId: createdSuggestion.id,
              memoryId: createdMemory.id,
              clientId: input.clientId,
              transport: input.transport,
              policyId: input.policyId,
              policyVersion: input.policyVersion,
              reason: null,
              statedPurpose: input.request.purpose,
              kind: input.request.kind,
              sensitivity: input.request.sensitivity,
              categoryKeys: input.request.categoryKeys,
              confidence: input.request.confidence,
              expiresAt: input.request.expiresAt,
              caller: input.request.sourceMetadata,
              directWrite: true
            },
            subjects: [
              ...suggestionAuditSubjects({
                suggestion: createdSuggestion,
                clientId: input.clientId,
                policyId: input.policyId,
                policyLabel: input.policyLabel
              }),
              this.auditTrail.auditMemorySubject(
                createdMemory,
                AuditSubjectRole.CREATED
              )
            ]
          }
        );

        const memoryAuditEvent = await this.auditTrail.createAuditEvent(tx, {
          userId: input.userId,
          clientId: input.clientId,
          type: AuditEventType.MEMORY_CREATED,
          actorType: AuditActorType.CLIENT,
          actorId: input.clientId,
          metadata: {
            memoryId: createdMemory.id,
            suggestionId: createdSuggestion.id,
            clientId: input.clientId,
            transport: input.transport,
            policyId: input.policyId,
            policyVersion: input.policyVersion,
            statedPurpose: input.request.purpose,
            reason: null,
            directWrite: true
          },
          subjects: [
            this.auditTrail.auditMemorySubject(
              createdMemory,
              AuditSubjectRole.CREATED
            ),
            ...suggestionAuditSubjects({
              suggestion: createdSuggestion,
              clientId: input.clientId,
              policyId: input.policyId,
              policyLabel: input.policyLabel
            })
          ]
        });

        await this.auditTrail.createMemoryProvenanceEntry(tx, {
          userId: input.userId,
          memoryId: createdMemory.id,
          type: MemoryProvenanceEntryType.SUGGESTED,
          actorType: AuditActorType.CLIENT,
          actorId: input.clientId,
          sourceType: SourceType.CLIENT_SUGGESTION,
          sourceClientId: input.clientId,
          suggestionId: createdSuggestion.id,
          auditEventId: memoryAuditEvent.id,
          evidence: input.request.evidence ?? null,
          confidence: input.request.confidence,
          metadata: {
            directWrite: true,
            policyId: input.policyId,
            suggestionAuditEventId: suggestionAuditEvent.id
          },
          subjects: suggestionProvenanceSubjects({
            memory: createdMemory,
            suggestion: createdSuggestion,
            clientId: input.clientId,
            policyId: input.policyId,
            auditEventIds: [suggestionAuditEvent.id, memoryAuditEvent.id]
          })
        });

        return {
          suggestion: createdSuggestion,
          memory: createdMemory,
          auditEvent: suggestionAuditEvent
        };
      }
    );

    return {
      suggestionId: suggestion.id,
      memoryId: memory.id,
      status: suggestion.status,
      policyId: input.policyId,
      auditEventId: auditEvent.id,
      reason: null,
      decision: "ALLOW" as const,
      denied: []
    };
  }

  inTransaction<T>(
    transaction: Prisma.TransactionClient | undefined,
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return transaction
      ? operation(transaction)
      : this.prisma.client.$transaction(operation);
  }

  async enqueueEmbeddingGeneration(userId: string, memoryId: string) {
    if (!this.embeddingJobs) {
      return;
    }

    try {
      await this.embeddingJobs.enqueueMemoryEmbedding({
        userId,
        memoryId,
        reason: "memory_created"
      });
    } catch {
      // Suggestion approval should not fail if the background queue is down.
    }
  }
}
