import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  JobStatus,
  JobType
} from "@funes-vault/db";
import { consolidationFailureMessage } from "@funes-vault/shared";
import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { errorMessage } from "../common/errors.js";
import { CONSOLIDATION_QUEUE_NAME } from "../common/queue-config.js";
import { defaultJobOptions } from "../common/queue-config.js";
import { toJson } from "../common/serialization.js";
import { apiEnv } from "../config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  type ConsolidationJobData,
  consolidationSchedulerId,
  type ConsolidationTrigger
} from "./consolidation.types.js";
import { ConsolidationLlmService } from "./consolidation-llm.service.js";
import { ConsolidationOrchestratorService } from "./consolidation-orchestrator.service.js";
import { consolidationResultAuditSubjects } from "./consolidation-subjects.js";

/**
 * Creates durable consolidation jobs and records attempts, terminal outcomes and
 * JOB_CREATED/JOB_COMPLETED/JOB_FAILED audits. The orchestrator owns candidate selection and
 * transactional memory changes.
 */
@Injectable()
export class ConsolidationJobService {
  private readonly logger = new Logger(ConsolidationJobService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditTrail: AuditTrailService,
    private readonly llm: ConsolidationLlmService,
    private readonly orchestrator: ConsolidationOrchestratorService
  ) {}

  async createConsolidationJobRun(
    userId: string,
    trigger: ConsolidationTrigger
  ) {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { consolidationMode: true }
    });

    return this.prisma.client.$transaction(async (tx) => {
      const created = await tx.jobRun.create({
        data: {
          userId,
          type: JobType.CONSOLIDATE_MEMORIES,
          status: JobStatus.QUEUED,
          maxAttempts: defaultJobOptions.attempts,
          metadata: {
            trigger,
            configuration: toJson(this.llm.configuration),
            mode: user.consolidationMode,
            queueName: CONSOLIDATION_QUEUE_NAME,
            schedulerId:
              trigger === "scheduled" ? consolidationSchedulerId(userId) : null,
            schedulePattern:
              trigger === "scheduled" ? apiEnv().CONSOLIDATION_CRON : null
          }
        }
      });

      await this.auditTrail.createAuditEvent(tx, {
        userId,
        type: AuditEventType.JOB_CREATED,
        actorType:
          trigger === "scheduled" ? AuditActorType.SYSTEM : AuditActorType.USER,
        actorId: trigger === "scheduled" ? null : userId,
        metadata: {
          jobRunId: created.id,
          type: JobType.CONSOLIDATE_MEMORIES,
          trigger,
          mode: user.consolidationMode,
          schedulerId:
            trigger === "scheduled" ? consolidationSchedulerId(userId) : null
        },
        subjects: [
          {
            type: AuditSubjectType.JOB_RUN,
            id: created.id,
            role: AuditSubjectRole.JOB,
            label: JobType.CONSOLIDATE_MEMORIES
          }
        ]
      });

      return created;
    });
  }

  async processConsolidation(job: Job<ConsolidationJobData>) {
    const data = job.data;
    const jobRunId =
      data.jobRunId ??
      (
        await this.createConsolidationJobRun(
          data.userId,
          data.trigger ?? "scheduled"
        )
      ).id;

    if (!data.jobRunId) {
      await job.updateData({ ...data, jobRunId });
    }

    await this.prisma.client.jobRun.update({
      where: { id: jobRunId },
      data: {
        status: JobStatus.RUNNING,
        attempts: { increment: 1 },
        startedAt: new Date()
      }
    });

    try {
      const result = await this.orchestrator.runConsolidation({
        userId: data.userId,
        jobRunId
      });

      await this.prisma.client.$transaction(async (tx) => {
        await tx.jobRun.update({
          where: { id: jobRunId },
          data: {
            status:
              result.semantic.status === "completed"
                ? JobStatus.SUCCEEDED
                : JobStatus.FAILED,
            error:
              result.semantic.status === "completed"
                ? null
                : consolidationFailureMessage(result.semantic.reason),
            metadata: toJson(result),
            finishedAt: new Date()
          }
        });
        await this.auditTrail.createAuditEvent(tx, {
          userId: data.userId,
          type:
            result.semantic.status === "completed"
              ? AuditEventType.JOB_COMPLETED
              : AuditEventType.JOB_FAILED,
          actorType: AuditActorType.JOB,
          actorId: jobRunId,
          metadata: result,
          subjects: consolidationResultAuditSubjects(result)
        });
      });
    } catch (error) {
      const message = errorMessage(error, "Unknown error");

      await this.prisma.client.$transaction(async (tx) => {
        await tx.jobRun.update({
          where: { id: jobRunId },
          data: {
            status: JobStatus.FAILED,
            error: message,
            finishedAt: new Date()
          }
        });
        await this.auditTrail.createAuditEvent(tx, {
          userId: data.userId,
          type: AuditEventType.JOB_FAILED,
          actorType: AuditActorType.JOB,
          actorId: jobRunId,
          metadata: {
            jobRunId,
            error: message
          },
          subjects: [
            {
              type: AuditSubjectType.JOB_RUN,
              id: jobRunId,
              role: AuditSubjectRole.JOB,
              label: JobType.CONSOLIDATE_MEMORIES
            }
          ]
        });
      });

      throw error;
    }
  }
}
