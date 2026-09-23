import {
  AuditSubjectRole,
  AuditSubjectType,
  ProvenanceSubjectRole,
  ProvenanceSubjectType
} from "@funes-vault/db";
import { Injectable, NotFoundException } from "@nestjs/common";

import { getObjectMetadata, toJson } from "../common/serialization.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  dedupeSubjects,
  inferAuditSubjects,
  toProvenanceSubjectResponse
} from "./audit-subjects.js";
import type {
  AuditEventTx,
  AuditSubjectInput,
  CreateAuditEventInput,
  CreateMemoryProvenanceInput,
  MemoryProvenanceEntryWithSubjects,
  ProvenanceSubjectInput,
  ProvenanceSubjectResponse,
  ProvenanceTx
} from "./audit-trail.types.js";
/**
 * Owns atomic audit and provenance records with subjects.
 * Tenant boundary: callers supply the owner inside the same transaction as the domain mutation.
 * Audit: subjects are inferred, deduplicated, and persisted atomically with each event.
 */
@Injectable()
export class AuditTrailService {
  constructor(private readonly prisma: PrismaService) {}

  async createAuditEvent(tx: AuditEventTx, input: CreateAuditEventInput) {
    const metadata = input.metadata ?? {};
    const event = await tx.auditEvent.create({
      data: {
        userId: input.userId,
        clientId: input.clientId,
        memoryRequestId: input.memoryRequestId,
        type: input.type,
        actorType: input.actorType,
        actorId: input.actorId,
        metadata: toJson(metadata)
      }
    });
    const inferred =
      input.inferSubjects === false ? [] : inferAuditSubjects(input, metadata);
    const subjects = dedupeSubjects([...inferred, ...(input.subjects ?? [])]);

    if (subjects.length > 0) {
      await tx.auditEventSubject.createMany({
        data: subjects.map((subject) => ({
          userId: input.userId,
          auditEventId: event.id,
          subjectType: subject.type,
          subjectId: subject.id as string,
          role: subject.role,
          labelSnapshot: subject.label ?? null,
          metadata: toJson(subject.metadata ?? {})
        })),
        skipDuplicates: true
      });
    }

    return event;
  }

  async createMemoryProvenanceEntry(
    tx: ProvenanceTx,
    input: CreateMemoryProvenanceInput
  ) {
    const entry = await tx.memoryProvenanceEntry.create({
      data: {
        userId: input.userId,
        memoryId: input.memoryId,
        type: input.type,
        actorType: input.actorType,
        actorId: input.actorId,
        sourceType: input.sourceType,
        sourceClientId: input.sourceClientId,
        sourceUri: input.sourceUri,
        suggestionId: input.suggestionId,
        jobRunId: input.jobRunId,
        auditEventId: input.auditEventId,
        memoryRequestId: input.memoryRequestId,
        reason: input.reason,
        evidence: input.evidence,
        confidence: input.confidence,
        metadata: toJson(input.metadata ?? {})
      }
    });
    const subjects = dedupeSubjects(input.subjects ?? []);

    if (subjects.length > 0) {
      await tx.memoryProvenanceSubject.createMany({
        data: subjects.map((subject) => ({
          userId: input.userId,
          provenanceEntryId: entry.id,
          subjectType: subject.type,
          subjectId: subject.id as string,
          role: subject.role,
          labelSnapshot: subject.label ?? null,
          metadata: toJson(subject.metadata ?? {})
        })),
        skipDuplicates: true
      });
    }

    return entry;
  }

  async getMemoryProvenance(userId: string, memoryId: string) {
    const memory = await this.prisma.client.memory.findFirst({
      where: { id: memoryId, userId },
      select: { id: true }
    });

    if (!memory) {
      throw new NotFoundException("Memory not found");
    }

    const entries = await this.prisma.client.memoryProvenanceEntry.findMany({
      where: { userId, memoryId },
      include: {
        subjects: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "asc" }
    });
    const memoryDetails = await this.relatedMemoryDetails(userId, entries);

    return {
      memoryId,
      entries: entries.map((entry) =>
        this.toMemoryProvenanceEntryResponse(entry, memoryDetails)
      )
    };
  }

  async getSubjectsForSuggestions(userId: string, suggestionIds: string[]) {
    const uniqueIds = [...new Set(suggestionIds)];

    if (uniqueIds.length === 0) {
      return new Map<string, ProvenanceSubjectResponse[]>();
    }

    const entries = await this.prisma.client.memoryProvenanceEntry.findMany({
      where: {
        userId,
        suggestionId: { in: uniqueIds }
      },
      include: { subjects: true },
      orderBy: { createdAt: "asc" }
    });
    const memoryDetails = await this.relatedMemoryDetails(userId, entries);
    const subjectsBySuggestionId = new Map<
      string,
      ProvenanceSubjectResponse[]
    >();

    for (const entry of entries) {
      if (!entry.suggestionId) {
        continue;
      }
      const subjects = entry.subjects.map((subject) =>
        toProvenanceSubjectResponse(subject, memoryDetails)
      );
      subjectsBySuggestionId.set(entry.suggestionId, [
        ...(subjectsBySuggestionId.get(entry.suggestionId) ?? []),
        ...subjects
      ]);
    }

    return subjectsBySuggestionId;
  }

  memorySubject(
    memory: { id: string; title?: string | null },
    role: ProvenanceSubjectRole
  ): ProvenanceSubjectInput {
    return {
      type: ProvenanceSubjectType.MEMORY,
      id: memory.id,
      role,
      label: memory.title ?? null
    };
  }

  auditMemorySubject(
    memory: { id: string; title?: string | null },
    role: AuditSubjectRole
  ): AuditSubjectInput {
    return {
      type: AuditSubjectType.MEMORY,
      id: memory.id,
      role,
      label: memory.title ?? null
    };
  }

  private async relatedMemoryDetails(
    userId: string,
    entries: MemoryProvenanceEntryWithSubjects[]
  ) {
    const memoryIds = [
      ...new Set(
        entries.flatMap((entry) =>
          entry.subjects
            .filter(
              (subject) => subject.subjectType === ProvenanceSubjectType.MEMORY
            )
            .map((subject) => subject.subjectId)
        )
      )
    ];

    if (memoryIds.length === 0) {
      return new Map<
        string,
        { title: string; status: string; sensitivity: string }
      >();
    }

    const memories = await this.prisma.client.memory.findMany({
      where: {
        userId,
        id: { in: memoryIds }
      },
      select: {
        id: true,
        title: true,
        status: true,
        sensitivity: true
      }
    });

    return new Map(
      memories.map((memory) => [
        memory.id,
        {
          title: memory.title,
          status: memory.status,
          sensitivity: memory.sensitivity
        }
      ])
    );
  }

  private toMemoryProvenanceEntryResponse(
    entry: MemoryProvenanceEntryWithSubjects,
    memoryDetails: Map<
      string,
      { title: string; status: string; sensitivity: string }
    >
  ) {
    return {
      id: entry.id,
      type: entry.type,
      actorType: entry.actorType,
      actorId: entry.actorId,
      sourceType: entry.sourceType,
      sourceClientId: entry.sourceClientId,
      sourceUri: entry.sourceUri,
      suggestionId: entry.suggestionId,
      jobRunId: entry.jobRunId,
      auditEventId: entry.auditEventId,
      memoryRequestId: entry.memoryRequestId,
      reason: entry.reason,
      evidence: entry.evidence,
      confidence: entry.confidence,
      metadata: getObjectMetadata(entry.metadata),
      subjects: entry.subjects.map((subject) =>
        toProvenanceSubjectResponse(subject, memoryDetails)
      ),
      createdAt: entry.createdAt.toISOString()
    };
  }
}
