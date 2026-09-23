import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  JobStatus,
  JobType,
  MemoryStatus
} from "@funes-vault/db";
import {
  type ImportVaultPreviewRequest,
  type ImportVaultRequest,
  type Memory
} from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { exportCategoryDefinitions } from "./import-mappers.js";
import { VaultImportWriterService } from "./vault-import-writer.service.js";
/**
 * Validates import previews and runs idempotent imports for the authenticated owner. Creates job
 * records and JOB_CREATED/JOB_COMPLETED audits in the import transaction; the import writer
 * remaps source identifiers.
 */
@Injectable()
export class VaultImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService,
    private readonly writer: VaultImportWriterService
  ) {}

  async previewImport(userId: string, input: ImportVaultPreviewRequest) {
    const duplicateCandidates = await this.findDuplicateMemories(
      userId,
      input.export.memories
    );

    return {
      preview: {
        schemaVersion: input.export.metadata.schemaVersion,
        exportedAt: input.export.metadata.exportedAt,
        memories: input.export.memories.length,
        archivedMemories: input.export.memories.filter(
          (memory) => memory.status === MemoryStatus.ARCHIVED
        ).length,
        categories: exportCategoryDefinitions(input.export).length,
        clients: input.export.clients.length,
        policies: input.export.policies.length,
        auditEvents: input.export.auditEvents?.length ?? 0,
        possibleDuplicateMemories: duplicateCandidates,
        categoryKeys: exportCategoryDefinitions(input.export).map(
          (category) => category.key
        )
      }
    };
  }

  async importVault(userId: string, input: ImportVaultRequest) {
    const result = await this.prisma.client.$transaction(async (tx) => {
      const startedAt = new Date();
      const jobRun = await tx.jobRun.create({
        data: {
          userId,
          type: JobType.PROCESS_IMPORT,
          status: JobStatus.RUNNING,
          attempts: 1,
          maxAttempts: 1,
          startedAt,
          metadata: {
            schemaVersion: input.export.metadata.schemaVersion,
            exportedAt: input.export.metadata.exportedAt,
            mode: input.mode,
            memoryCount: input.export.memories.length
          }
        }
      });

      await this.auditTrail.createAuditEvent(tx, {
        userId,
        type: AuditEventType.JOB_CREATED,
        actorType: AuditActorType.USER,
        actorId: userId,
        metadata: {
          jobRunId: jobRun.id,
          type: JobType.PROCESS_IMPORT
        },
        subjects: [
          {
            type: AuditSubjectType.JOB_RUN,
            id: jobRun.id,
            role: AuditSubjectRole.JOB,
            label: JobType.PROCESS_IMPORT
          }
        ]
      });

      const categories = exportCategoryDefinitions(input.export);
      await this.writer.upsertCategories(tx, categories);
      const clientIdMap = await this.writer.importClients(
        tx,
        userId,
        input.export
      );
      const importedPolicyIds = await this.writer.importPolicies(tx, {
        userId,
        exportFile: input.export,
        clientIdMap
      });
      const memoryResult =
        input.mode === "ACTIVE_MEMORIES"
          ? await this.writer.importActiveMemories(tx, {
              userId,
              exportFile: input.export,
              clientIdMap,
              jobRunId: jobRun.id
            })
          : await this.writer.importSuggestions(tx, {
              userId,
              exportFile: input.export,
              clientIdMap,
              jobRunId: jobRun.id
            });
      const finishedAt = new Date();

      await tx.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: JobStatus.SUCCEEDED,
          finishedAt,
          metadata: {
            schemaVersion: input.export.metadata.schemaVersion,
            exportedAt: input.export.metadata.exportedAt,
            mode: input.mode,
            memoriesCreated: memoryResult.memoriesCreated,
            suggestionsCreated: memoryResult.suggestionsCreated,
            clientsCreated: clientIdMap.size,
            policiesCreated: importedPolicyIds.length,
            categoriesUpserted: categories.length
          }
        }
      });

      await this.auditTrail.createAuditEvent(tx, {
        userId,
        type: AuditEventType.JOB_COMPLETED,
        actorType: AuditActorType.USER,
        actorId: userId,
        metadata: {
          jobRunId: jobRun.id,
          type: JobType.PROCESS_IMPORT,
          mode: input.mode,
          memoriesCreated: memoryResult.memoriesCreated,
          suggestionsCreated: memoryResult.suggestionsCreated
        },
        subjects: [
          {
            type: AuditSubjectType.JOB_RUN,
            id: jobRun.id,
            role: AuditSubjectRole.JOB,
            label: JobType.PROCESS_IMPORT
          }
        ]
      });

      return {
        mode: input.mode,
        memoriesCreated: memoryResult.memoriesCreated,
        suggestionsCreated: memoryResult.suggestionsCreated,
        clientsCreated: clientIdMap.size,
        policiesCreated: importedPolicyIds.length,
        categoriesUpserted: categories.length,
        jobRunId: jobRun.id
      };
    });

    return { imported: result };
  }

  async findDuplicateMemories(userId: string, memories: Memory[]) {
    if (memories.length === 0) {
      return [];
    }

    const existing = await this.prisma.client.memory.findMany({
      where: {
        userId,
        status: { not: MemoryStatus.DELETED },
        OR: memories.map((memory) => ({
          title: memory.title,
          body: memory.body
        }))
      },
      select: { id: true, title: true, body: true }
    });
    const existingByFingerprint = new Map(
      existing.map((memory) => [
        `${memory.title}\n${memory.body}`,
        { id: memory.id, title: memory.title }
      ])
    );

    return memories.flatMap((memory) => {
      const duplicate = existingByFingerprint.get(
        `${memory.title}\n${memory.body}`
      );

      return duplicate
        ? [
            {
              importedId: memory.id,
              existingId: duplicate.id,
              title: duplicate.title
            }
          ]
        : [];
    });
  }
}
