import type { ChatMessage, MemoryExtractionRun } from "@funes-vault/db";
import {
  AuditActorType,
  AuditEventType,
  MemoryExtractionRunStatus
} from "@funes-vault/db";
import { type MemoryProcessingOutcome } from "@funes-vault/shared";
import { ConflictException, Injectable } from "@nestjs/common";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { lockUser } from "../common/db-locks.js";
import { toJson } from "../common/serialization.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { CandidateApplier } from "./candidate-applier.js";
import { type Candidate } from "./contracts.js";
import { extractionTransactionTimeoutMs } from "./extraction.constants.js";
import { type ProcessingConfiguration } from "./memory-processing-config.service.js";
import {
  ProcessingBlocked,
  ProcessingPermissionService
} from "./processing-permission.service.js";
import { processingStatus } from "./processing-status.js";
import { sanitizedFailure } from "./validation.js";
type OutcomeContext = {
  userId: string;
  sourceMessageId: string;
  source: ChatMessage;
  run: MemoryExtractionRun;
  configuration: ProcessingConfiguration;
  claimToken: string;
};

/**
 * Commits source processing results under owner/run locks and rechecks claim and processor
 * consent. Candidate changes, result snapshots and completion audit share a transaction; failed
 * or skipped outcomes release their claim without inventing a disclosure audit.
 */
@Injectable()
export class ExtractionOutcomeWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService,
    private readonly permission: ProcessingPermissionService,
    private readonly applier: CandidateApplier
  ) {}

  async persistOutcome(
    input: OutcomeContext & {
      signal: AbortSignal;
      startedAt: number;
      candidates: Candidate[];
      partial: boolean;
      diagnostics: Record<string, unknown>;
      clientId: string;
      channel: "chat" | "voice";
    }
  ) {
    const {
      userId,
      sourceMessageId,
      source,
      run,
      configuration,
      claimToken,
      signal,
      startedAt,
      candidates,
      partial,
      diagnostics,
      clientId,
      channel
    } = input;

    return this.prisma.client.$transaction(
      async (tx) => {
        await lockUser(tx, userId);
        // Lock claim and consent together with candidate application. No network calls occur here.
        await tx.$queryRaw`SELECT id FROM "MemoryExtractionRun" WHERE id = ${run.id} FOR UPDATE`;
        const current = await tx.memoryExtractionRun.findUniqueOrThrow({
          where: { id: run.id }
        });
        if (current.claimToken !== claimToken) {
          throw new ConflictException("Processing claim expired");
        }
        signal.throwIfAborted();
        await this.permission.check(
          userId,
          "extraction",
          configuration.extraction.processors,
          undefined,
          tx
        );
        const outcomes: MemoryProcessingOutcome[] = [];
        const pending: Candidate[] = [];
        for (const candidate of candidates) {
          if (
            candidate.disposition !== "eligible" ||
            ["correction", "retraction"].includes(candidate.intent)
          ) {
            if (candidate.disposition !== "rejected") {
              pending.push(candidate);
            }
            outcomes.push({
              candidateId: candidate.id,
              title: candidate.title,
              status:
                candidate.disposition === "rejected"
                  ? "rejected"
                  : ["correction", "retraction"].includes(candidate.intent)
                    ? "pending_reconciliation"
                    : "needs_clarification",
              reason: candidate.reason
            });
            continue;
          }
          outcomes.push(
            await this.applier.applyCandidate(
              tx,
              userId,
              run.id,
              source.id,
              clientId,
              channel,
              candidate,
              configuration
            )
          );
        }
        const status =
          partial || candidates.some((c) => c.disposition === "rejected")
            ? MemoryExtractionRunStatus.PARTIAL
            : MemoryExtractionRunStatus.COMPLETED;
        const result = {
          runId: run.id,
          sourceMessageId,
          status: processingStatus(status),
          outcomes,
          processors: configuration.extraction.processors,
          model: configuration.extraction.model,
          rubric: configuration.rubric,
          fingerprint: run.fingerprint,
          latencyMs: Date.now() - startedAt,
          diagnostics: diagnostics
        };
        await tx.memoryExtractionRun.update({
          where: { id: run.id },
          data: {
            status,
            result: toJson(result),
            pendingCandidates: toJson(pending),
            leaseUntil: null,
            claimToken: null,
            finishedAt: new Date(),
            failureReason: null
          }
        });
        await tx.chatMessage.update({
          where: { id: source.id },
          data: { processing: toJson(result) }
        });
        await this.auditTrail.createAuditEvent(tx, {
          userId,
          type: AuditEventType.MEMORY_PROCESSING_COMPLETED,
          actorType: AuditActorType.SYSTEM,
          metadata: {
            runId: run.id,
            sourceMessageId,
            status,
            fingerprint: run.fingerprint,
            rubric: configuration.rubric,
            model: configuration.extraction.model,
            outcomeCount: outcomes.length
          }
        });

        return result;
      },
      { timeout: extractionTransactionTimeoutMs }
    );
  }

  async persistFailure(
    input: Omit<OutcomeContext, "configuration"> & {
      configuration?: ProcessingConfiguration;
    },
    error: unknown
  ) {
    const { sourceMessageId, source, run, configuration, claimToken } = input;
    const reason =
      error instanceof ProcessingBlocked
        ? error.reason
        : sanitizedFailure(error);
    const status =
      error instanceof ProcessingBlocked
        ? MemoryExtractionRunStatus.SKIPPED
        : MemoryExtractionRunStatus.FAILED;
    const result = {
      runId: run.id,
      sourceMessageId,
      status: processingStatus(status),
      reason,
      outcomes: [],
      processors: configuration?.extraction.processors ?? [],
      fingerprint: run.fingerprint
    };
    await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.memoryExtractionRun.updateMany({
        where: { id: run.id, claimToken },
        data: {
          status,
          result: toJson(result),
          failureReason: reason,
          claimToken: null,
          leaseUntil: null,
          finishedAt: new Date()
        }
      });
      if (updated.count) {
        await tx.chatMessage.update({
          where: { id: source.id },
          data: { processing: toJson(result) }
        });
      }
    });
  }
}
