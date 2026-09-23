import {
  AuditActorType,
  AuditEventType,
  MemoryProvenanceEntryType,
  MemoryStatus,
  type MemorySuggestion,
  MemorySuggestionStatus,
  type Prisma,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { lockMemories } from "../common/db-locks.js";
import { toMemoryResponse } from "../memories/memory.mapper.js";
import { memoryInclude } from "../memories/memory.types.js";
import { toMemorySuggestionResponse } from "../memory-suggestions/memory-suggestion.mapper.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  archiveAuditSubjects,
  archiveProvenanceSubjects
} from "./archive-suggestion-subjects.js";
import { claimSuggestion } from "./claim-suggestion.js";
/**
 * Claims an owner’s archive suggestion, locks the owner before sorted memory rows, and
 * revalidates target and survivor versions. Archive, review audit and provenance commit
 * atomically; stale proposals return conflict.
 */
@Injectable()
export class ArchiveSuggestionApplier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService
  ) {}

  async applyArchiveSuggestion(
    userId: string,
    existing: MemorySuggestion,
    sourceMetadata: Record<string, unknown>
  ) {
    const targetMemoryId = sourceMetadata.targetMemoryId;

    if (typeof targetMemoryId !== "string" || targetMemoryId.length === 0) {
      throw new BadRequestException("Archive suggestion is missing a target");
    }

    const { suggestion, memory } = await this.prisma.client.$transaction(
      async (tx) => {
        await claimSuggestion(
          tx,
          userId,
          existing.id,
          MemorySuggestionStatus.APPLIED
        );
        const recordIds = [
          targetMemoryId,
          ...(typeof sourceMetadata.canonicalMemoryId === "string"
            ? [sourceMetadata.canonicalMemoryId]
            : [])
        ].sort();
        await lockMemories(tx, userId, recordIds);
        const target = await tx.memory.findFirst({
          where: { id: targetMemoryId, userId },
          include: memoryInclude
        });

        if (!target) {
          throw new NotFoundException("Target memory not found");
        }

        if (
          sourceMetadata.targetVersion &&
          (target.status !== MemoryStatus.ACTIVE ||
            target.updatedAt.toISOString() !== sourceMetadata.targetVersion)
        ) {
          throw new ConflictException(
            "This proposal is stale; run consolidation again."
          );
        }
        if (typeof sourceMetadata.canonicalMemoryId === "string") {
          const survivor = await tx.memory.findFirst({
            where: {
              id: sourceMetadata.canonicalMemoryId,
              userId,
              status: MemoryStatus.ACTIVE,
              reviewState: ReviewState.APPROVED
            }
          });
          if (
            !survivor ||
            survivor.id === target.id ||
            (survivor.expiresAt && survivor.expiresAt <= new Date()) ||
            (sourceMetadata.canonicalVersion &&
              survivor.updatedAt.toISOString() !==
                sourceMetadata.canonicalVersion)
          ) {
            throw new ConflictException(
              "The surviving memory changed; run consolidation again."
            );
          }
        }
        const archivedMemory = await tx.memory.update({
          where: { id: target.id },
          data: {
            status:
              sourceMetadata.reason === "expired"
                ? MemoryStatus.EXPIRED
                : MemoryStatus.ARCHIVED
          },
          include: memoryInclude
        });
        const updatedSuggestion = await tx.memorySuggestion.update({
          where: { id: existing.id },
          data: { status: MemorySuggestionStatus.APPLIED }
        });

        const canonicalMemory = await this.findCanonicalMemoryForSuggestion(
          tx,
          userId,
          sourceMetadata
        );
        const jobRunId = this.stringMetadata(sourceMetadata.jobRunId);
        const reason = this.stringMetadata(sourceMetadata.reason);
        const suggestionAuditEvent = await this.auditTrail.createAuditEvent(
          tx,
          {
            userId,
            type: AuditEventType.MEMORY_SUGGESTION_APPROVED,
            actorType: AuditActorType.USER,
            actorId: userId,
            metadata: {
              suggestionId: existing.id,
              memoryId: archivedMemory.id,
              canonicalMemoryId: canonicalMemory?.id ?? null,
              jobRunId,
              action: "archive_memory",
              reason
            },
            subjects: archiveAuditSubjects({
              suggestion: existing,
              target: archivedMemory,
              canonical: canonicalMemory,
              jobRunId
            })
          }
        );
        const archiveAuditEvent = await this.auditTrail.createAuditEvent(tx, {
          userId,
          type: AuditEventType.MEMORY_ARCHIVED,
          actorType: AuditActorType.USER,
          actorId: userId,
          metadata: {
            memoryId: archivedMemory.id,
            suggestionId: existing.id,
            canonicalMemoryId: canonicalMemory?.id ?? null,
            jobRunId,
            action: "archive_memory",
            reason
          },
          subjects: archiveAuditSubjects({
            suggestion: existing,
            target: archivedMemory,
            canonical: canonicalMemory,
            jobRunId
          })
        });

        await this.auditTrail.createMemoryProvenanceEntry(tx, {
          userId,
          memoryId: archivedMemory.id,
          type: MemoryProvenanceEntryType.CONSOLIDATION_APPLIED,
          actorType: AuditActorType.USER,
          actorId: userId,
          sourceType: SourceType.CONSOLIDATION,
          suggestionId: existing.id,
          jobRunId,
          auditEventId: archiveAuditEvent.id,
          reason,
          evidence: existing.evidence,
          confidence: existing.confidence,
          metadata: {
            mode: this.stringMetadata(sourceMetadata.mode) ?? "REVIEW_ONLY",
            suggestionAuditEventId: suggestionAuditEvent.id
          },
          subjects: archiveProvenanceSubjects({
            suggestion: existing,
            target: archivedMemory,
            canonical: canonicalMemory,
            jobRunId,
            auditEventIds: [suggestionAuditEvent.id, archiveAuditEvent.id]
          })
        });

        return { suggestion: updatedSuggestion, memory: archivedMemory };
      }
    );

    return {
      suggestion: toMemorySuggestionResponse(suggestion),
      memory: toMemoryResponse(memory)
    };
  }

  async findCanonicalMemoryForSuggestion(
    tx: Pick<Prisma.TransactionClient, "memory">,
    userId: string,
    sourceMetadata: Record<string, unknown>
  ) {
    const canonicalMemoryId = this.stringMetadata(
      sourceMetadata.canonicalMemoryId
    );

    if (!canonicalMemoryId) {
      return null;
    }

    return tx.memory.findFirst({
      where: { id: canonicalMemoryId, userId },
      select: { id: true, title: true }
    });
  }

  stringMetadata(value: unknown) {
    return typeof value === "string" && value.length > 0 ? value : null;
  }
}
