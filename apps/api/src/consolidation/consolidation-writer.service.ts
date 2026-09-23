import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  type ConsolidationMode,
  MemoryProvenanceEntryType,
  MemoryStatus,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { lockMemories, lockUser } from "../common/db-locks.js";
import { toJson } from "../common/serialization.js";
import { ProcessingPermissionService } from "../memory-processing/processing-permission.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  type ArchiveCandidate,
  candidateConfidence,
  categoryKeys
} from "./consolidation.types.js";
import {
  consolidationArchiveAuditSubjects,
  consolidationArchiveProvenanceSubjects
} from "./consolidation-subjects.js";

/**
 * Owns revision-checked archive application and review suggestions.
 * Tenant boundary: candidates, jobs, consent, and affected memories share an owner.
 * Audit: the writer records audit/provenance transactionally and checks content revisions.
 */
@Injectable()
export class ConsolidationWriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService,
    private readonly permission: ProcessingPermissionService
  ) {}

  async createArchiveSuggestion(
    userId: string,
    jobRunId: string,
    candidate: ArchiveCandidate,
    mode: ConsolidationMode,
    queuedArchiveSuggestionTargetIds: Set<string>
  ) {
    if (queuedArchiveSuggestionTargetIds.has(candidate.memory.id)) {
      return null;
    }

    return this.prisma.client.$transaction(async (tx) => {
      if (!(await this.candidateStillValid(tx, userId, candidate))) {
        return null;
      }
      const suggestion = await tx.memorySuggestion.create({
        data: {
          userId,
          sourceType: SourceType.CONSOLIDATION,
          title: `Archive ${candidate.memory.title}`,
          body: `Archive this memory: ${candidate.memory.body}`,
          suggestedKind: candidate.memory.kind,
          suggestedSensitivity: candidate.memory.sensitivity,
          suggestedCategories: categoryKeys(candidate.memory),
          evidence: candidate.evidence,
          confidence: candidateConfidence(candidate),
          sourceMetadata: {
            processing: candidate.processing
              ? toJson(candidate.processing)
              : null,
            targetVersion: candidate.memory.updatedAt.toISOString(),
            canonicalVersion:
              candidate.canonicalMemory?.updatedAt.toISOString() ?? null,
            action: "archive_memory",
            reason: candidate.reason,
            targetMemoryId: candidate.memory.id,
            targetTitle: candidate.memory.title,
            canonicalMemoryId: candidate.canonicalMemory?.id ?? null,
            canonicalTitle: candidate.canonicalMemory?.title ?? null,
            jobRunId,
            mode
          }
        }
      });

      await this.auditTrail.createMemoryProvenanceEntry(tx, {
        userId,
        memoryId: candidate.memory.id,
        type: MemoryProvenanceEntryType.CONSOLIDATION_SUGGESTED,
        actorType: AuditActorType.JOB,
        actorId: jobRunId,
        sourceType: SourceType.CONSOLIDATION,
        suggestionId: suggestion.id,
        jobRunId,
        reason: candidate.reason,
        evidence: candidate.evidence,
        confidence: candidateConfidence(candidate),
        metadata: {
          action: "archive_memory",
          mode
        },
        subjects: consolidationArchiveProvenanceSubjects({
          candidate,
          suggestionId: suggestion.id,
          jobRunId,
          auditEventId: null
        })
      });

      return suggestion;
    });
  }

  async candidateStillValid(
    tx: import("@funes-vault/db").Prisma.TransactionClient,
    userId: string,
    candidate: ArchiveCandidate
  ) {
    await lockUser(tx, userId);
    const ids = [
      candidate.memory.id,
      ...(candidate.canonicalMemory ? [candidate.canonicalMemory.id] : [])
    ].sort();
    await lockMemories(tx, userId, ids);
    for (const expected of [candidate.memory, candidate.canonicalMemory].filter(
      (m) => !!m
    )) {
      const actual = await tx.memory.findFirst({
        where: {
          id: expected.id,
          userId,
          status: MemoryStatus.ACTIVE,
          updatedAt: expected.updatedAt
        }
      });
      if (!actual) {
        return false;
      }
      if (
        expected.id === candidate.canonicalMemory?.id &&
        (actual.reviewState !== ReviewState.APPROVED ||
          (actual.expiresAt && actual.expiresAt <= new Date()))
      ) {
        return false;
      }
    }
    if (
      candidate.processing &&
      Array.isArray(candidate.processing.processors) &&
      candidate.processing.processors.includes("typesafe")
    ) {
      const consent = await tx.processingConsent.findUnique({
        where: {
          userId_processor_scope: {
            userId,
            processor: "typesafe",
            scope: "consolidation"
          }
        }
      });
      if (!this.permission.isConsentValid(consent)) {
        return false;
      }
    }

    return true;
  }

  async archiveCandidate(
    userId: string,
    jobRunId: string,
    candidate: ArchiveCandidate,
    mode: ConsolidationMode
  ) {
    const result = await this.prisma.client.$transaction(async (tx) => {
      if (!(await this.candidateStillValid(tx, userId, candidate))) {
        return { archived: false, auditEventId: null };
      }
      const memory = await tx.memory.findFirst({
        where: {
          id: candidate.memory.id,
          userId,
          status: MemoryStatus.ACTIVE
        },
        select: { id: true }
      });

      if (!memory) {
        return { archived: false, auditEventId: null };
      }

      await tx.memory.update({
        where: { id: memory.id },
        data: {
          status:
            candidate.reason === "expired"
              ? MemoryStatus.EXPIRED
              : MemoryStatus.ARCHIVED
        }
      });
      const auditEvent = await this.auditTrail.createAuditEvent(tx, {
        userId,
        type: AuditEventType.MEMORY_ARCHIVED,
        actorType: AuditActorType.JOB,
        actorId: jobRunId,
        metadata: {
          memoryId: memory.id,
          action: "archive_memory",
          reason: candidate.reason,
          canonicalMemoryId: candidate.canonicalMemory?.id ?? null,
          canonicalTitle: candidate.canonicalMemory?.title ?? null,
          jobRunId,
          mode
        },
        subjects: consolidationArchiveAuditSubjects({
          candidate,
          jobRunId,
          auditRole: AuditSubjectRole.ARCHIVED
        })
      });

      await this.auditTrail.createMemoryProvenanceEntry(tx, {
        userId,
        memoryId: candidate.memory.id,
        type: MemoryProvenanceEntryType.CONSOLIDATION_APPLIED,
        actorType: AuditActorType.JOB,
        actorId: jobRunId,
        sourceType: SourceType.CONSOLIDATION,
        jobRunId,
        auditEventId: auditEvent.id,
        reason: candidate.reason,
        evidence: candidate.evidence,
        confidence: candidateConfidence(candidate),
        metadata: {
          action: "archive_memory",
          mode
        },
        subjects: consolidationArchiveProvenanceSubjects({
          candidate,
          suggestionId: null,
          jobRunId,
          auditEventId: auditEvent.id
        })
      });

      return { archived: true, auditEventId: auditEvent.id };
    });

    return result;
  }
}
