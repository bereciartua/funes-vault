import { randomUUID } from "node:crypto";

import { MemorySuggestionStatus } from "@funes-vault/db";
import { AuditActorType, AuditEventType, MemoryStatus } from "@funes-vault/db";
import {
  memoryProcessingOutcomeSchema,
  memoryProcessingResultSchema
} from "@funes-vault/shared";
import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { lockUser } from "../common/db-locks.js";
import { getObjectMetadata, toJson } from "../common/serialization.js";
import { FirstPartyAccessService } from "../first-party-access/first-party-access.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CandidateApplier } from "./candidate-applier.js";
import {
  pendingCandidatesSchema,
  processingConfigurationSchema,
  reconciliationReceiptSchema,
  reconciliationToolArgsSchema,
  reconciliationToolOutputSchema
} from "./contracts.js";
import {
  reconciliationMatchLimit,
  toolReceiptPrefix
} from "./extraction.constants.js";
import { ProcessingPermissionService } from "./processing-permission.service.js";
import { reconciliationTerms, termFilters } from "./reconciliation.js";
import { reconciliationToolNames } from "./reconciliation-tools.js";

/**
 * Persists source-bound tool receipts and resolves server-issued pending candidates. Completion
 * rechecks the owner, claim and supporting search/mutation receipts before delegating candidate
 * application.
 */
@Injectable()
export class ExtractionReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService,
    private readonly access: FirstPartyAccessService,
    private readonly permission: ProcessingPermissionService,
    private readonly applier: CandidateApplier
  ) {}

  async recordTool(
    userId: string,
    sourceMessageId: string,
    toolName: string,
    args: unknown,
    output: unknown
  ) {
    if (!reconciliationToolNames().includes(toolName)) {
      return;
    }
    const run = await this.prisma.client.memoryExtractionRun.findFirst({
      where: { userId, sourceMessageId }
    });
    if (!run) {
      return;
    }
    const value = reconciliationToolOutputSchema.parse(output);
    const input = reconciliationToolArgsSchema.parse(args);
    await this.prisma.client.$transaction(async (tx) => {
      const recordIds =
        value.items?.map((item) => item.id) ??
        [input.memoryId ?? input.suggestionId].filter((id): id is string =>
          Boolean(id)
        );
      await tx.memoryCandidateApplication.create({
        data: {
          runId: run.id,
          candidateId: `${toolReceiptPrefix}${randomUUID()}`,
          result: toJson({ toolName, recordIds })
        }
      });
      if (
        ![
          ...reconciliationToolNames("memory_search"),
          ...reconciliationToolNames("suggestion_search")
        ].includes(toolName)
      ) {
        await this.auditTrail.createAuditEvent(tx, {
          userId,
          type: AuditEventType.MEMORY_PROCESSING_COMPLETED,
          actorType: AuditActorType.USER,
          actorId: userId,
          metadata: {
            runId: run.id,
            sourceMessageId,
            toolName,
            recordIds,
            stage: "reconciliation"
          }
        });
      }
    });
  }

  async complete(
    userId: string,
    sourceMessageId: string,
    candidateId: string,
    resolution: "handled" | "create" | "defer"
  ) {
    const run = await this.prisma.client.memoryExtractionRun.findFirst({
      where: { userId, sourceMessageId },
      include: { source: true }
    });
    if (!run) {
      throw new NotFoundException("Processing run not found");
    }
    const configuration = processingConfigurationSchema.parse(
      run.configuration
    );
    const channel = run.source.voiceSessionId ? "voice" : "chat";
    const client =
      channel === "voice"
        ? await this.access.ensureVoiceAccess(userId)
        : await this.access.ensureWebChatAccess(userId);
    const completed = await this.prisma.client.$transaction(async (tx) => {
      await lockUser(tx, userId);
      await tx.$queryRaw`SELECT id FROM "MemoryExtractionRun" WHERE id = ${run.id} FOR UPDATE`;
      const current = await tx.memoryExtractionRun.findUniqueOrThrow({
        where: { id: run.id }
      });
      const existing = await tx.memoryCandidateApplication.findUnique({
        where: { runId_candidateId: { runId: run.id, candidateId } }
      });
      if (existing) {
        return memoryProcessingOutcomeSchema.parse(existing.result);
      }
      const pending = pendingCandidatesSchema.parse(current.pendingCandidates);
      const candidate = pending.find((c) => c.id === candidateId);
      if (!candidate) {
        throw new NotFoundException("Candidate not pending");
      }
      if (resolution === "defer" || candidate.disposition !== "eligible") {
        return { candidateId, status: "needs_clarification" };
      }
      await this.permission.check(
        userId,
        "extraction",
        configuration.extraction.processors,
        undefined,
        tx
      );
      const receipts = await tx.memoryCandidateApplication.findMany({
        where: { runId: run.id, candidateId: { startsWith: toolReceiptPrefix } }
      });
      const evidence = receipts.map((r) =>
        reconciliationReceiptSchema.parse(r.result)
      );
      const searched = evidence.filter((e) =>
        [
          ...reconciliationToolNames("memory_search"),
          ...reconciliationToolNames("suggestion_search")
        ].includes(e.toolName)
      );
      if (
        !searched.some((e) =>
          reconciliationToolNames("memory_search").includes(e.toolName)
        ) ||
        !searched.some((e) =>
          reconciliationToolNames("suggestion_search").includes(e.toolName)
        )
      ) {
        throw new ConflictException(
          "Search active memories and queued suggestions before reconciliation"
        );
      }
      const terms = reconciliationTerms(
        `${candidate.title} ${candidate.body} ${candidate.evidence.map((e) => e.quote).join(" ")}`
      );
      const related = terms.length
        ? await Promise.all([
            tx.memory.findMany({
              where: {
                userId,
                status: MemoryStatus.ACTIVE,
                OR: termFilters(terms)
              },
              select: { id: true },
              take: reconciliationMatchLimit
            }),
            tx.memorySuggestion.findMany({
              where: {
                userId,
                status: MemorySuggestionStatus.QUEUED_FOR_REVIEW,
                OR: termFilters(terms)
              },
              select: { id: true },
              take: reconciliationMatchLimit
            })
          ])
        : [[], []];
      const matched = [
        ...new Set([
          ...searched.flatMap((e) => e.recordIds),
          ...related.flat().map((m) => m.id)
        ])
      ];
      const mutated = new Set(
        evidence
          .filter((e) =>
            reconciliationToolNames("mutation").includes(e.toolName)
          )
          .flatMap((e) => e.recordIds)
      );
      if (
        resolution === "create" &&
        (matched.length || candidate.intent === "retraction")
      ) {
        return {
          candidateId,
          status: "pending_reconciliation",
          reason:
            "Existing records require reconciliation; a retraction cannot create a replacement",
          relatedRecordIds: matched
        };
      }
      if (
        resolution === "handled" &&
        (!mutated.size || matched.some((id) => !mutated.has(id)))
      ) {
        throw new ConflictException(
          "Matched records still require reconciliation or clarification"
        );
      }
      const outcome =
        resolution === "create"
          ? await this.applier.applyCandidate(
              tx,
              userId,
              run.id,
              sourceMessageId,
              client.clientId,
              channel,
              candidate,
              configuration
            )
          : {
              candidateId,
              title: candidate.title,
              status: "reconciled",
              recordIds: [...mutated]
            };
      if (resolution === "handled") {
        await tx.memoryCandidateApplication.create({
          data: { runId: run.id, candidateId, result: toJson(outcome) }
        });
      }
      const result = memoryProcessingResultSchema.parse(current.result);
      const updated = {
        ...getObjectMetadata(current.result),
        outcomes: [
          ...(result.outcomes ?? []).filter(
            (o) => o.candidateId !== candidateId
          ),
          outcome
        ]
      };
      await tx.memoryExtractionRun.update({
        where: { id: run.id },
        data: {
          pendingCandidates: toJson(
            pending.filter((c) => c.id !== candidateId)
          ),
          result: toJson(updated)
        }
      });
      await tx.chatMessage.update({
        where: { id: sourceMessageId },
        data: { processing: toJson(updated) }
      });

      return outcome;
    });
    await this.applier.enqueueApplied(userId, [getObjectMetadata(completed)]);

    return completed;
  }
}
