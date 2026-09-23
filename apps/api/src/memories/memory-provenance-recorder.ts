import { SourceType } from "@funes-vault/db";
import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  type Memory,
  MemoryProvenanceEntryType,
  MemoryStatus,
  type Prisma,
  ProvenanceSubjectRole,
  ProvenanceSubjectType
} from "@funes-vault/db";
import { type UpdateMemoryRequest } from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { getObjectMetadata } from "../common/serialization.js";
import { type MemoryWithCategories } from "./memory.types.js";
import {
  memoryContentFields,
  memorySourceFields,
  memoryStatusFields
} from "./memory-fields.js";
type MemoryMutation = "create" | "update" | "archive" | "delete";
type MemoryUpdateSnapshot = Pick<
  Memory,
  | "id"
  | "title"
  | "status"
  | "reviewState"
  | "sourceType"
  | "sourceClientId"
  | "sourceUri"
  | "sourceMetadata"
>;
/** Records memory lifecycle provenance and audit subjects inside the caller’s transaction. The calling writer supplies the authenticated owner and validated records. */
@Injectable()
export class MemoryProvenanceRecorder {
  constructor(private readonly auditTrail: AuditTrailService) {}
  auditMutationForUpdate(
    currentStatus: MemoryStatus,
    request: UpdateMemoryRequest
  ): MemoryMutation {
    if (
      currentStatus !== MemoryStatus.ARCHIVED &&
      request.status === MemoryStatus.ARCHIVED
    ) {
      return "archive";
    }

    if (request.status === MemoryStatus.DELETED) {
      return "delete";
    }

    return "update";
  }

  async createAuditEvent(
    tx: Pick<Prisma.TransactionClient, "auditEvent" | "auditEventSubject">,
    userId: string,
    memory: Pick<Memory, "id" | "title">,
    mutation: MemoryMutation
  ) {
    const typeByMutation = {
      create: AuditEventType.MEMORY_CREATED,
      update: AuditEventType.MEMORY_UPDATED,
      archive: AuditEventType.MEMORY_ARCHIVED,
      delete: AuditEventType.MEMORY_DELETED
    } satisfies Record<MemoryMutation, AuditEventType>;

    const roleByMutation = {
      create: AuditSubjectRole.CREATED,
      update: AuditSubjectRole.UPDATED,
      archive: AuditSubjectRole.ARCHIVED,
      delete: AuditSubjectRole.DELETED
    } satisfies Record<MemoryMutation, AuditSubjectRole>;

    return this.auditTrail.createAuditEvent(tx, {
      userId,
      type: typeByMutation[mutation],
      actorType: AuditActorType.USER,
      actorId: userId,
      metadata: { memoryId: memory.id },
      subjects: [
        this.auditTrail.auditMemorySubject(memory, roleByMutation[mutation])
      ]
    });
  }

  async createProvenanceForCreate(
    tx: Pick<
      Prisma.TransactionClient,
      "memoryProvenanceEntry" | "memoryProvenanceSubject"
    >,
    input: {
      userId: string;
      memory: MemoryWithCategories;
      auditEventId: string;
      sourceMetadata: Record<string, unknown>;
    }
  ) {
    await this.auditTrail.createMemoryProvenanceEntry(tx, {
      userId: input.userId,
      memoryId: input.memory.id,
      type:
        input.memory.sourceType === SourceType.IMPORT
          ? MemoryProvenanceEntryType.IMPORTED
          : MemoryProvenanceEntryType.CREATED,
      actorType: AuditActorType.USER,
      actorId: input.userId,
      sourceType: input.memory.sourceType,
      sourceClientId: input.memory.sourceClientId,
      sourceUri: input.memory.sourceUri,
      auditEventId: input.auditEventId,
      metadata: {
        sourceMetadata: input.sourceMetadata
      },
      subjects: [
        this.auditTrail.memorySubject(
          input.memory,
          ProvenanceSubjectRole.TARGET
        ),
        {
          type: ProvenanceSubjectType.AUDIT_EVENT,
          id: input.auditEventId,
          role: ProvenanceSubjectRole.AUDIT_EVENT
        },
        {
          type: ProvenanceSubjectType.CLIENT,
          id: input.memory.sourceClientId,
          role: ProvenanceSubjectRole.CLIENT
        }
      ]
    });
  }

  async createProvenanceForUpdate(
    tx: Pick<
      Prisma.TransactionClient,
      "memoryProvenanceEntry" | "memoryProvenanceSubject"
    >,
    input: {
      userId: string;
      before: MemoryUpdateSnapshot;
      after: MemoryWithCategories;
      request: Partial<UpdateMemoryRequest>;
      auditEventId: string;
    }
  ) {
    const changedFields = Object.keys(input.request);
    const baseSubjects = [
      this.auditTrail.memorySubject(input.after, ProvenanceSubjectRole.TARGET),
      {
        type: ProvenanceSubjectType.AUDIT_EVENT,
        id: input.auditEventId,
        role: ProvenanceSubjectRole.AUDIT_EVENT
      }
    ];
    const lifecycleType = this.lifecycleProvenanceType(
      input.before.status,
      input.request.status
    );

    if (lifecycleType) {
      await this.auditTrail.createMemoryProvenanceEntry(tx, {
        userId: input.userId,
        memoryId: input.after.id,
        type: lifecycleType,
        actorType: AuditActorType.USER,
        actorId: input.userId,
        sourceType: input.after.sourceType,
        sourceClientId: input.after.sourceClientId,
        sourceUri: input.after.sourceUri,
        auditEventId: input.auditEventId,
        reason: lifecycleType.toLowerCase(),
        metadata: {
          changedFields,
          previousStatus: input.before.status,
          status: input.after.status
        },
        subjects: baseSubjects
      });
    }

    if (this.hasSourceChange(input.request)) {
      await this.auditTrail.createMemoryProvenanceEntry(tx, {
        userId: input.userId,
        memoryId: input.after.id,
        type: MemoryProvenanceEntryType.SOURCE_UPDATED,
        actorType: AuditActorType.USER,
        actorId: input.userId,
        sourceType: input.after.sourceType,
        sourceClientId: input.after.sourceClientId,
        sourceUri: input.after.sourceUri,
        auditEventId: input.auditEventId,
        metadata: {
          changedFields: changedFields.filter((field) =>
            memorySourceFields.some((key) => key === field)
          ),
          previousSource: this.sourceSummary(input.before),
          source: this.sourceSummary(input.after),
          previousSourceMetadataKeys: Object.keys(
            getObjectMetadata(input.before.sourceMetadata)
          ),
          sourceMetadataKeys: Object.keys(
            getObjectMetadata(input.after.sourceMetadata)
          )
        },
        subjects: baseSubjects
      });
    }

    if (this.hasContentChange(input.request)) {
      await this.auditTrail.createMemoryProvenanceEntry(tx, {
        userId: input.userId,
        memoryId: input.after.id,
        type: MemoryProvenanceEntryType.CONTENT_UPDATED,
        actorType: AuditActorType.USER,
        actorId: input.userId,
        sourceType: input.after.sourceType,
        sourceClientId: input.after.sourceClientId,
        sourceUri: input.after.sourceUri,
        auditEventId: input.auditEventId,
        metadata: {
          changedFields: changedFields.filter((field) =>
            memoryContentFields.some((key) => key === field)
          )
        },
        subjects: baseSubjects
      });
    }

    if (!lifecycleType && this.hasStatusChange(input.request)) {
      await this.auditTrail.createMemoryProvenanceEntry(tx, {
        userId: input.userId,
        memoryId: input.after.id,
        type: MemoryProvenanceEntryType.STATUS_CHANGED,
        actorType: AuditActorType.USER,
        actorId: input.userId,
        sourceType: input.after.sourceType,
        sourceClientId: input.after.sourceClientId,
        sourceUri: input.after.sourceUri,
        auditEventId: input.auditEventId,
        metadata: {
          changedFields: changedFields.filter((field) =>
            memoryStatusFields.some((key) => key === field)
          ),
          previousStatus: input.before.status,
          status: input.after.status,
          previousReviewState: input.before.reviewState,
          reviewState: input.after.reviewState
        },
        subjects: baseSubjects
      });
    }
  }

  private lifecycleProvenanceType(
    currentStatus: MemoryStatus,
    nextStatus: MemoryStatus | undefined
  ) {
    if (!nextStatus || nextStatus === currentStatus) {
      return null;
    }

    if (nextStatus === MemoryStatus.ARCHIVED) {
      return MemoryProvenanceEntryType.ARCHIVED;
    }

    if (nextStatus === MemoryStatus.DELETED) {
      return MemoryProvenanceEntryType.DELETED;
    }

    if (
      nextStatus === MemoryStatus.ACTIVE &&
      currentStatus !== MemoryStatus.ACTIVE
    ) {
      return MemoryProvenanceEntryType.RESTORED;
    }

    return null;
  }

  private hasSourceChange(request: Partial<UpdateMemoryRequest>) {
    return memorySourceFields.some((field) => request[field] !== undefined);
  }

  private hasContentChange(request: Partial<UpdateMemoryRequest>) {
    return memoryContentFields.some((field) => request[field] !== undefined);
  }

  private hasStatusChange(request: Partial<UpdateMemoryRequest>) {
    return request.status !== undefined || request.reviewState !== undefined;
  }

  private sourceSummary(
    memory: Pick<Memory, "sourceType" | "sourceClientId" | "sourceUri">
  ) {
    return {
      type: memory.sourceType,
      clientId: memory.sourceClientId,
      uri: memory.sourceUri
    };
  }
}
