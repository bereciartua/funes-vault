import { randomUUID } from "node:crypto";

import type { MemoryExtractionRun } from "@funes-vault/db";
import {
  AuditActorType,
  AuditEventType,
  MemoryExtractionRunStatus
} from "@funes-vault/db";
import { memoryProcessingResultSchema } from "@funes-vault/shared";
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
import { processingConfigurationSchema } from "./contracts.js";
import { extractionLeaseSlackMs } from "./extraction.constants.js";
import { ExtractionOutcomeWriter } from "./extraction-outcome-writer.js";
import { ExtractionProviderService } from "./extraction-provider.service.js";
import { MemoryProcessingConfigService } from "./memory-processing-config.service.js";
import { processingStatus } from "./processing-status.js";

/**
 * Claims extraction runs by source, lease and token, then coordinates provider work and
 * transactional outcomes. Reprocessing records configuration changes; corrupt saved
 * configurations become failed outcomes without a provider call.
 */
@Injectable()
export class ExtractionRunService {
  constructor(
    private readonly auditTrail: AuditTrailService,
    private readonly prisma: PrismaService,
    private readonly config: MemoryProcessingConfigService,
    private readonly access: FirstPartyAccessService,
    private readonly provider: ExtractionProviderService,
    private readonly writer: ExtractionOutcomeWriter,
    private readonly applier: CandidateApplier
  ) {}

  async reprocess(userId: string, sourceMessageId: string) {
    const configuration = await this.config.forUser(userId);
    await this.prisma.client.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const run = await tx.memoryExtractionRun.findFirst({
        where: { userId, sourceMessageId }
      });
      if (!run) {
        throw new NotFoundException("Processing run not found");
      }
      const changed = await tx.memoryExtractionRun.updateMany({
        where: {
          id: run.id,
          status: {
            in: [
              MemoryExtractionRunStatus.FAILED,
              MemoryExtractionRunStatus.SKIPPED
            ]
          },
          leaseUntil: null
        },
        data: {
          configuration: toJson(configuration),
          fingerprint: configuration.fingerprint,
          status: MemoryExtractionRunStatus.PENDING,
          result: {},
          failureReason: null
        }
      });
      if (!changed.count) {
        throw new ConflictException(
          "Only failed or skipped runs can use a new configuration"
        );
      }
      await this.auditTrail.createAuditEvent(tx, {
        userId,
        type: AuditEventType.MEMORY_PROCESSING_COMPLETED,
        actorType: AuditActorType.USER,
        actorId: userId,
        metadata: {
          action: "explicit_reprocess",
          runId: run.id,
          sourceMessageId,
          previousFingerprint: run.fingerprint,
          fingerprint: configuration.fingerprint
        }
      });
    });

    return this.process(userId, sourceMessageId);
  }

  async retry(userId: string, sourceMessageId: string) {
    await this.prisma.client.memoryExtractionRun.updateMany({
      where: {
        userId,
        sourceMessageId,
        status: MemoryExtractionRunStatus.SKIPPED
      },
      data: { status: MemoryExtractionRunStatus.FAILED }
    });

    return this.process(userId, sourceMessageId);
  }

  async result(userId: string, sourceMessageId: string) {
    const run = await this.prisma.client.memoryExtractionRun.findFirst({
      where: { userId, sourceMessageId }
    });

    if (!run) {
      await this.provider.loadSource(userId, sourceMessageId);
    }

    return memoryProcessingResultSchema.parse(
      run
        ? {
            ...getObjectMetadata(run.result),
            runId: run.id,
            status: processingStatus(run.status)
          }
        : { status: processingStatus(MemoryExtractionRunStatus.PENDING) }
    );
  }

  async claimRun(
    run: MemoryExtractionRun,
    claimToken: string,
    deadline: number
  ) {
    return this.prisma.client.memoryExtractionRun.updateMany({
      where: {
        id: run.id,
        status: {
          in: [
            MemoryExtractionRunStatus.PENDING,
            MemoryExtractionRunStatus.FAILED,
            MemoryExtractionRunStatus.RUNNING
          ]
        },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }]
      },
      data: {
        status: MemoryExtractionRunStatus.RUNNING,
        claimToken,
        leaseUntil: new Date(deadline + extractionLeaseSlackMs),
        attempts: { increment: 1 }
      }
    });
  }

  async process(
    userId: string,
    sourceMessageId: string,
    channel: "chat" | "voice" = "chat",
    abortSignal?: AbortSignal
  ) {
    const source = await this.provider.loadSource(userId, sourceMessageId);
    const currentConfiguration = await this.config.forUser(userId);
    const run = await this.prisma.client.memoryExtractionRun.upsert({
      where: { sourceMessageId },
      create: {
        userId,
        sourceMessageId,
        configuration: toJson(currentConfiguration),
        fingerprint: currentConfiguration.fingerprint
      },
      update: {}
    });
    if (
      [
        MemoryExtractionRunStatus.COMPLETED,
        MemoryExtractionRunStatus.PARTIAL,
        MemoryExtractionRunStatus.SKIPPED
      ].some((status) => status === run.status)
    ) {
      return this.result(userId, sourceMessageId);
    }
    const parsedConfiguration = processingConfigurationSchema.safeParse(
      run.configuration
    );
    if (!parsedConfiguration.success) {
      // A corrupt persisted snapshot must reach a terminal outcome without invoking a provider.
      const claimToken = randomUUID();
      const claimed = await this.claimRun(run, claimToken, Date.now());
      if (claimed.count) {
        await this.writer.persistFailure(
          { userId, sourceMessageId, source, run, claimToken },
          new Error("Invalid saved processing configuration")
        );
      }

      return this.result(userId, sourceMessageId);
    }
    const configuration = parsedConfiguration.data;
    const claimToken = randomUUID();
    const deadline = Date.now() + configuration.extraction.timeoutMs;

    const claimed = await this.claimRun(run, claimToken, deadline);
    if (!claimed.count) {
      return {
        runId: run.id,
        status: processingStatus(MemoryExtractionRunStatus.PENDING)
      };
    }
    const signal = AbortSignal.any([
      AbortSignal.timeout(configuration.extraction.timeoutMs),
      ...(abortSignal ? [abortSignal] : [])
    ]);
    const startedAt = Date.now();
    const context = {
      userId,
      sourceMessageId,
      source,
      run,
      configuration,
      claimToken
    };
    try {
      const input = await this.provider.prepareInput(
        userId,
        source,
        run,
        configuration,
        channel
      );
      channel = input.channel;
      const output = await this.provider.invokeProvider(
        userId,
        run.id,
        input,
        configuration,
        signal,
        deadline
      );
      const client =
        channel === "voice"
          ? await this.access.ensureVoiceAccess(userId)
          : await this.access.ensureWebChatAccess(userId);
      const result = await this.writer.persistOutcome({
        ...context,
        ...output,
        signal,
        startedAt,
        clientId: client.clientId,
        channel
      });
      await this.applier.enqueueApplied(userId, result.outcomes);

      return result;
    } catch (error) {
      await this.writer.persistFailure(context, error);

      return this.result(userId, sourceMessageId);
    }
  }
}
