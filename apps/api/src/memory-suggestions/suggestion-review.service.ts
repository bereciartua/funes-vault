import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  MemoryProvenanceEntryType,
  type MemorySuggestion,
  MemorySuggestionStatus,
  type Prisma
} from "@funes-vault/db";
import { type ListMemorySuggestionsQuery } from "@funes-vault/shared";
import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { buildPagination, paginationSkip } from "../common/pagination.js";
import { getObjectMetadata } from "../common/serialization.js";
import { CategoriesService } from "../memories/categories.service.js";
import { toMemoryResponse } from "../memories/memory.mapper.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ArchiveSuggestionApplier } from "./archive-suggestion-applier.js";
import { claimSuggestion } from "./claim-suggestion.js";
import { toMemorySuggestionResponse } from "./memory-suggestion.mapper.js";
import { createMemoryFromSuggestion } from "./suggestion-records.js";
import {
  suggestionAuditSubjects,
  suggestionProvenanceSubjects
} from "./suggestion-subjects.js";
import { SuggestionWriterService } from "./suggestion-writer.service.js";

/**
 * Lists owner suggestions and applies or rejects them under a transaction-owned status claim.
 * Writes review audits and provenance with the resulting memory; stale or already reviewed
 * proposals return conflict.
 */
@Injectable()
export class SuggestionReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService,
    private readonly categories: CategoriesService,
    private readonly writer: SuggestionWriterService,
    private readonly archive: ArchiveSuggestionApplier
  ) {}

  async listUserSuggestions(userId: string, input: ListMemorySuggestionsQuery) {
    const where: Prisma.MemorySuggestionWhereInput = {
      userId,
      status: input.status === "ALL" ? undefined : input.status
    };

    const total = await this.prisma.client.memorySuggestion.count({ where });
    const pagination = buildPagination(input, total);
    const items =
      total === 0
        ? []
        : await this.prisma.client.memorySuggestion.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: paginationSkip(pagination),
            take: pagination.limit
          });

    const subjectsBySuggestionId =
      await this.auditTrail.getSubjectsForSuggestions(
        userId,
        items.map((item) => item.id)
      );

    return {
      items: items.map((item) =>
        toMemorySuggestionResponse(
          item,
          subjectsBySuggestionId.get(item.id) ?? []
        )
      ),
      pagination
    };
  }

  async applyUserSuggestion(userId: string, id: string) {
    const existing = await this.prisma.client.memorySuggestion.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      throw new NotFoundException("Memory suggestion not found");
    }

    if (existing.status !== MemorySuggestionStatus.QUEUED_FOR_REVIEW) {
      throw new ConflictException("Memory suggestion is not reviewable");
    }

    await this.categories.assertExist(existing.suggestedCategories);

    return this.applyLoadedUserSuggestion(userId, existing);
  }

  async applyLoadedUserSuggestion(userId: string, existing: MemorySuggestion) {
    const sourceMetadata = getObjectMetadata(existing.sourceMetadata);
    if (
      existing.sourceType === "CONSOLIDATION" &&
      sourceMetadata.action === "archive_memory"
    ) {
      return this.archive.applyArchiveSuggestion(
        userId,
        existing,
        sourceMetadata
      );
    }

    const { suggestion, memory } = await this.prisma.client.$transaction(
      async (tx) => {
        await claimSuggestion(
          tx,
          userId,
          existing.id,
          MemorySuggestionStatus.APPLIED
        );
        const createdMemory = await createMemoryFromSuggestion(tx, existing);
        const updatedSuggestion = await tx.memorySuggestion.update({
          where: { id: existing.id },
          data: { status: MemorySuggestionStatus.APPLIED }
        });

        const suggestionAuditEvent = await this.auditTrail.createAuditEvent(
          tx,
          {
            userId,
            type: AuditEventType.MEMORY_SUGGESTION_APPROVED,
            actorType: AuditActorType.USER,
            actorId: userId,
            metadata: {
              suggestionId: existing.id,
              memoryId: createdMemory.id
            },
            subjects: [
              this.auditTrail.auditMemorySubject(
                createdMemory,
                AuditSubjectRole.CREATED
              ),
              ...suggestionAuditSubjects({
                suggestion: existing,
                clientId: existing.sourceClientId,
                policyId: null,
                policyLabel: null
              })
            ]
          }
        );
        const memoryAuditEvent = await this.auditTrail.createAuditEvent(tx, {
          userId,
          type: AuditEventType.MEMORY_CREATED,
          actorType: AuditActorType.USER,
          actorId: userId,
          metadata: {
            memoryId: createdMemory.id,
            suggestionId: existing.id,
            clientId: existing.sourceClientId
          },
          subjects: [
            this.auditTrail.auditMemorySubject(
              createdMemory,
              AuditSubjectRole.CREATED
            ),
            ...suggestionAuditSubjects({
              suggestion: existing,
              clientId: existing.sourceClientId,
              policyId: null,
              policyLabel: null
            })
          ]
        });

        await this.auditTrail.createMemoryProvenanceEntry(tx, {
          userId,
          memoryId: createdMemory.id,
          type: MemoryProvenanceEntryType.SUGGESTED,
          actorType: AuditActorType.USER,
          actorId: userId,
          sourceType: existing.sourceType,
          sourceClientId: existing.sourceClientId,
          suggestionId: existing.id,
          auditEventId: memoryAuditEvent.id,
          evidence: existing.evidence,
          confidence: existing.confidence,
          metadata: {
            suggestionAuditEventId: suggestionAuditEvent.id
          },
          subjects: suggestionProvenanceSubjects({
            memory: createdMemory,
            suggestion: existing,
            clientId: existing.sourceClientId,
            policyId: null,
            auditEventIds: [suggestionAuditEvent.id, memoryAuditEvent.id]
          })
        });

        return { suggestion: updatedSuggestion, memory: createdMemory };
      }
    );

    await this.writer.enqueueEmbeddingGeneration(userId, memory.id);

    return {
      suggestion: toMemorySuggestionResponse(suggestion),
      memory: toMemoryResponse(memory)
    };
  }

  async rejectUserSuggestion(userId: string, id: string) {
    const existing = await this.prisma.client.memorySuggestion.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      throw new NotFoundException("Memory suggestion not found");
    }

    if (existing.status !== MemorySuggestionStatus.QUEUED_FOR_REVIEW) {
      throw new ConflictException("Memory suggestion is not reviewable");
    }

    return this.rejectLoadedUserSuggestion(userId, existing);
  }

  async rejectLoadedUserSuggestion(userId: string, existing: MemorySuggestion) {
    const suggestion = await this.prisma.client.$transaction(async (tx) => {
      await claimSuggestion(
        tx,
        userId,
        existing.id,
        MemorySuggestionStatus.REJECTED
      );
      const updated = await tx.memorySuggestion.update({
        where: { id: existing.id },
        data: { status: MemorySuggestionStatus.REJECTED }
      });

      await this.auditTrail.createAuditEvent(tx, {
        userId,
        type: AuditEventType.MEMORY_SUGGESTION_REJECTED,
        actorType: AuditActorType.USER,
        actorId: userId,
        metadata: {
          suggestionId: existing.id,
          clientId: existing.sourceClientId
        },
        subjects: suggestionAuditSubjects({
          suggestion: existing,
          clientId: existing.sourceClientId,
          policyId: null,
          policyLabel: null
        })
      });

      return updated;
    });

    return { suggestion: toMemorySuggestionResponse(suggestion) };
  }
}
