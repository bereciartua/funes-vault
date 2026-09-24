import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  ClientTrustLevel,
  JobType,
  MemoryProvenanceEntryType,
  MemoryStatus,
  type Prisma,
  ProvenanceSubjectRole,
  ProvenanceSubjectType,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import { type Memory, type VaultExport } from "@funes-vault/shared";
import { Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { getObjectMetadata, toDateOrNull } from "../common/serialization.js";
import {
  importedActiveStatus,
  importSourceMetadata,
  uniqueImportName
} from "./import-mappers.js";

/**
 * Creates imported suggestions or memories under the importing owner with new identifiers.
 * Records creation audits and import provenance in the caller’s transaction. It neither exports
 * data nor creates import jobs.
 */
@Injectable()
export class VaultImportWriterService {
  constructor(private readonly auditTrail: AuditTrailService) {}
  async upsertCategories(
    tx: Prisma.TransactionClient,
    categories: VaultExport["categories"]
  ) {
    for (const category of categories) {
      await tx.memoryCategory.upsert({
        where: { key: category.key },
        create: {
          key: category.key,
          name: category.name,
          description: category.description
        },
        update: {}
      });
    }
  }

  async importClients(
    tx: Prisma.TransactionClient,
    userId: string,
    exportFile: VaultExport
  ) {
    const existingClients = await tx.client.findMany({
      where: { userId },
      select: { name: true }
    });
    const claimedNames = new Set(
      existingClients.map((client) => client.name.toLowerCase())
    );
    const clientIdMap = new Map<string, string>();

    for (const client of exportFile.clients) {
      const name = uniqueImportName(client.name, claimedNames);
      const created = await tx.client.create({
        data: {
          userId,
          name,
          type: client.type,
          trustLevel: ClientTrustLevel.UNKNOWN,
          declaredRetention: client.declaredRetention
        }
      });

      clientIdMap.set(client.id, created.id);
    }

    return clientIdMap;
  }

  async importPolicies(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      exportFile: VaultExport;
      clientIdMap: Map<string, string>;
    }
  ) {
    const createdIds: string[] = [];

    for (const policy of input.exportFile.policies) {
      const clientId = input.clientIdMap.get(policy.clientId);
      if (!clientId) {
        throw new Error("Policy client is missing from validated export");
      }

      const created = await tx.policy.create({
        data: {
          userId: input.userId,
          clientId,
          maxSensitivity: policy.maxSensitivity,
          operations: policy.operations,
          requiresConfirmation: policy.requiresConfirmation,
          expiresAt: toDateOrNull(policy.expiresAt),
          allowedCategories: {
            connect: policy.allowedCategoryKeys.map((key) => ({ key }))
          },
          deniedCategories: {
            connect: policy.deniedCategoryKeys.map((key) => ({ key }))
          }
        }
      });
      createdIds.push(created.id);
    }

    return createdIds;
  }

  async importSuggestions(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      exportFile: VaultExport;
      clientIdMap: Map<string, string>;
      jobRunId: string;
    }
  ) {
    let suggestionsCreated = 0;
    let memoriesCreated = 0;

    for (const memory of input.exportFile.memories) {
      // Archived memories are dormant context: restoring them as review
      // suggestions would resurface them as active-memory candidates and
      // duplicate the active memories that replaced them. Restore them
      // directly in their archived state instead.
      if (memory.status === MemoryStatus.ARCHIVED) {
        await this.restoreExportedMemory(tx, input, memory);
        memoriesCreated += 1;
        continue;
      }

      const suggestion = await tx.memorySuggestion.create({
        data: {
          userId: input.userId,
          sourceType: SourceType.IMPORT,
          sourceClientId: null,
          title: memory.title,
          body: memory.body,
          suggestedKind: memory.kind,
          suggestedSensitivity: memory.sensitivity,
          suggestedCategories: memory.categoryKeys,
          evidence: "Imported from a Funes Vault export.",
          confidence: memory.confidence,
          expiresAt: toDateOrNull(memory.expiresAt),
          sourceMetadata: importSourceMetadata(input.exportFile, memory)
        }
      });

      await this.auditTrail.createAuditEvent(tx, {
        userId: input.userId,
        type: AuditEventType.MEMORY_SUGGESTION_CREATED,
        actorType: AuditActorType.USER,
        actorId: input.userId,
        metadata: {
          suggestionId: suggestion.id,
          importedMemoryId: memory.id,
          sourceExportedAt: input.exportFile.metadata.exportedAt,
          jobRunId: input.jobRunId
        },
        subjects: [
          {
            type: AuditSubjectType.MEMORY_SUGGESTION,
            id: suggestion.id,
            role: AuditSubjectRole.SUGGESTION,
            label: suggestion.title
          },
          {
            type: AuditSubjectType.IMPORT,
            id: memory.id,
            role: AuditSubjectRole.IMPORTED,
            label: memory.title,
            metadata: {
              sourceExportedAt: input.exportFile.metadata.exportedAt
            }
          },
          {
            type: AuditSubjectType.JOB_RUN,
            id: input.jobRunId,
            role: AuditSubjectRole.JOB,
            label: JobType.PROCESS_IMPORT
          }
        ]
      });

      suggestionsCreated += 1;
    }

    return { memoriesCreated, suggestionsCreated };
  }

  async importActiveMemories(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      exportFile: VaultExport;
      clientIdMap: Map<string, string>;
      jobRunId: string;
    }
  ) {
    let memoriesCreated = 0;

    for (const memory of input.exportFile.memories) {
      await this.restoreExportedMemory(tx, input, memory);
      memoriesCreated += 1;
    }

    return { memoriesCreated, suggestionsCreated: 0 };
  }

  async restoreExportedMemory(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      exportFile: VaultExport;
      clientIdMap: Map<string, string>;
      jobRunId: string;
    },
    memory: Memory
  ) {
    const created = await tx.memory.create({
      data: {
        userId: input.userId,
        kind: memory.kind,
        title: memory.title,
        body: memory.body,
        sensitivity: memory.sensitivity,
        confidence: memory.confidence,
        status: importedActiveStatus(memory),
        reviewState: ReviewState.APPROVED,
        sourceType: SourceType.IMPORT,
        sourceClientId: memory.source.clientId
          ? (input.clientIdMap.get(memory.source.clientId) ?? null)
          : null,
        sourceUri: memory.source.uri,
        sourceMetadata: importSourceMetadata(input.exportFile, memory),
        expiresAt: toDateOrNull(memory.expiresAt),
        categories: {
          connect: memory.categoryKeys.map((key) => ({ key }))
        }
      }
    });

    const auditEvent = await this.auditTrail.createAuditEvent(tx, {
      userId: input.userId,
      type: AuditEventType.MEMORY_CREATED,
      actorType: AuditActorType.USER,
      actorId: input.userId,
      metadata: {
        memoryId: created.id,
        importedMemoryId: memory.id,
        sourceExportedAt: input.exportFile.metadata.exportedAt,
        jobRunId: input.jobRunId
      },
      subjects: [
        this.auditTrail.auditMemorySubject(
          { id: created.id, title: memory.title },
          AuditSubjectRole.CREATED
        ),
        {
          type: AuditSubjectType.IMPORT,
          id: memory.id,
          role: AuditSubjectRole.IMPORTED,
          label: memory.title,
          metadata: {
            sourceExportedAt: input.exportFile.metadata.exportedAt
          }
        },
        {
          type: AuditSubjectType.JOB_RUN,
          id: input.jobRunId,
          role: AuditSubjectRole.JOB,
          label: JobType.PROCESS_IMPORT
        }
      ]
    });

    const sourceMetadata = getObjectMetadata(
      importSourceMetadata(input.exportFile, memory)
    );
    await this.auditTrail.createMemoryProvenanceEntry(tx, {
      userId: input.userId,
      memoryId: created.id,
      type: MemoryProvenanceEntryType.IMPORTED,
      actorType: AuditActorType.USER,
      actorId: input.userId,
      sourceType: SourceType.IMPORT,
      sourceClientId: memory.source.clientId
        ? (input.clientIdMap.get(memory.source.clientId) ?? null)
        : null,
      sourceUri: memory.source.uri,
      auditEventId: auditEvent.id,
      jobRunId: input.jobRunId,
      reason: "import",
      metadata: {
        importedFrom: sourceMetadata.importedFrom,
        originalSource: sourceMetadata.originalSource
      },
      subjects: [
        this.auditTrail.memorySubject(
          { id: created.id, title: memory.title },
          ProvenanceSubjectRole.TARGET
        ),
        {
          type: ProvenanceSubjectType.IMPORT,
          id: memory.id,
          role: ProvenanceSubjectRole.IMPORT_SOURCE,
          label: memory.title,
          metadata: {
            sourceExportedAt: input.exportFile.metadata.exportedAt
          }
        },
        {
          type: ProvenanceSubjectType.JOB_RUN,
          id: input.jobRunId,
          role: ProvenanceSubjectRole.JOB
        },
        {
          type: ProvenanceSubjectType.AUDIT_EVENT,
          id: auditEvent.id,
          role: ProvenanceSubjectRole.AUDIT_EVENT
        }
      ]
    });
  }
}
