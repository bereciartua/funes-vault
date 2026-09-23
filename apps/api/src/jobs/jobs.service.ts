import { JobStatus, JobType, type Prisma } from "@funes-vault/db";
import {
  type ListJobsQuery,
  type UpdateConsolidationSettingsRequest
} from "@funes-vault/shared";
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";

import { buildPagination, paginationSkip } from "../common/pagination.js";
import {
  CONSOLIDATION_QUEUE_NAME,
  defaultJobOptions,
  redisConnectionOptions,
  shouldRunJobWorkers
} from "../common/queue-config.js";
import { getObjectMetadata } from "../common/serialization.js";
import { initializeWorker } from "../common/worker-startup.js";
import { apiEnv } from "../config.js";
import {
  type ConsolidationJobData,
  consolidationSchedulerId,
  type ConsolidationTrigger
} from "../consolidation/consolidation.types.js";
import { ConsolidationJobService } from "../consolidation/consolidation-job.service.js";
import { EmbeddingJobsService } from "../embeddings/embedding-jobs.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toJobRunResponse } from "./job.mapper.js";

/**
 * Owns job queries, queue lifecycle, and consolidation scheduling.
 * Tenant boundary: job queries and scheduler identifiers are bound to their owner.
 * Audit: domain runners record job outcomes; retries do not bypass owner checks.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private workerReady = false;
  private readonly logger = new Logger(JobsService.name);
  private queue: Queue<ConsolidationJobData> | null = null;
  private worker: Worker<ConsolidationJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingJobs: EmbeddingJobsService,
    private readonly runner: ConsolidationJobService
  ) {}

  getQueue() {
    const connection = redisConnectionOptions();
    if (!this.queue && connection) {
      this.queue = new Queue<ConsolidationJobData>(CONSOLIDATION_QUEUE_NAME, {
        connection
      });
      this.queue.on("error", () =>
        this.logger.warn("Redis queue connection unavailable")
      );
    }

    return this.queue;
  }

  async onModuleInit() {
    const connection = redisConnectionOptions();

    if (!connection) {
      this.logger.warn(
        "REDIS_URL is not configured; consolidation jobs will be recorded but not enqueued"
      );

      return;
    }

    // Producers initialize in the background: Redis failure affects readiness, not liveness.
    this.getQueue();

    if (!shouldRunJobWorkers()) {
      this.logger.log(
        "JOB_WORKER_ENABLED is false; consolidation queue producer is enabled without a worker"
      );

      return;
    }

    this.worker = new Worker<ConsolidationJobData>(
      CONSOLIDATION_QUEUE_NAME,
      async (job) => this.runner.processConsolidation(job),
      { connection: redisConnectionOptions(true)! }
    );
    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Consolidation job ${job?.id ?? "unknown"} failed: ${error.message}`
      );
    });
    this.worker.on("error", () =>
      this.logger.warn("Redis worker connection unavailable")
    );
    const ready = this.worker.waitUntilReady().then(async () => {
      this.workerReady = true;
      await this.syncScheduledConsolidationJobs();
    });
    await initializeWorker(ready, () =>
      this.logger.warn("Background worker startup unavailable")
    );
  }

  async onModuleDestroy() {
    await this.worker?.close(!this.workerReady);
    await this.queue?.close();
  }

  getRuntimeStatus() {
    return {
      queueConfigured: this.queue !== null,
      workerEnabled: shouldRunJobWorkers(),
      workerRunning: this.workerReady
    };
  }

  async listJobs(userId: string, input: ListJobsQuery) {
    const where: Prisma.JobRunWhereInput = {
      userId,
      type: input.type,
      status: input.status
    };

    const total = await this.prisma.client.jobRun.count({ where });
    const pagination = buildPagination(input, total);
    const items =
      total === 0
        ? []
        : await this.prisma.client.jobRun.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: paginationSkip(pagination),
            take: pagination.limit
          });

    return {
      items: items.map(toJobRunResponse),
      pagination
    };
  }

  async getJob(userId: string, id: string) {
    const job = await this.prisma.client.jobRun.findFirst({
      where: { id, userId }
    });

    if (!job) {
      throw new NotFoundException("Job run not found");
    }

    return { job: toJobRunResponse(job) };
  }

  async retryJob(userId: string, id: string) {
    const job = await this.prisma.client.jobRun.findFirst({
      where: { id, userId }
    });

    if (!job) {
      throw new NotFoundException("Job run not found");
    }

    if (job.status !== JobStatus.FAILED && job.status !== JobStatus.CANCELLED) {
      throw new ConflictException("Only failed or cancelled jobs can retry");
    }

    const metadata = getObjectMetadata(job.metadata);

    if (job.type === JobType.GENERATE_EMBEDDING) {
      const memoryId = metadata.memoryId;

      if (typeof memoryId !== "string" || memoryId.length === 0) {
        throw new ConflictException("Embedding job is missing a memory ID");
      }

      const result = await this.embeddingJobs.enqueueMemoryEmbedding({
        userId,
        memoryId,
        reason: "manual_regeneration"
      });

      return this.getJob(userId, result.jobRunId);
    }

    if (job.type === JobType.CONSOLIDATE_MEMORIES) {
      return this.enqueueConsolidationRun(userId, "manual_retry", metadata);
    }

    throw new ConflictException("This job type does not support retry yet");
  }

  async getConsolidationSettings(userId: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        consolidationEnabled: true,
        consolidationMode: true
      }
    });

    return {
      settings: {
        enabled: user.consolidationEnabled,
        mode: user.consolidationMode
      }
    };
  }

  async updateConsolidationSettings(
    userId: string,
    input: UpdateConsolidationSettingsRequest
  ) {
    const user = await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        consolidationEnabled: input.enabled,
        consolidationMode: input.mode
      },
      select: {
        consolidationEnabled: true,
        consolidationMode: true
      }
    });

    await this.syncScheduledConsolidationJob(userId, user.consolidationEnabled);

    return {
      settings: {
        enabled: user.consolidationEnabled,
        mode: user.consolidationMode
      }
    };
  }

  async enqueueConsolidationRun(
    userId: string,
    trigger: ConsolidationTrigger = "manual",
    retryMetadata?: Record<string, unknown>
  ) {
    const jobRun = await this.runner.createConsolidationJobRun(userId, trigger);

    if (retryMetadata) {
      await this.prisma.client.jobRun.update({
        where: { id: jobRun.id },
        data: {
          metadata: {
            ...getObjectMetadata(jobRun.metadata),
            ...retryMetadata
          } as import("@funes-vault/db").Prisma.InputJsonValue
        }
      });
    }
    if (!this.queue) {
      const cancelled = await this.prisma.client.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: JobStatus.CANCELLED,
          error: "REDIS_URL is not configured"
        }
      });

      return { job: toJobRunResponse(cancelled) };
    }

    const job = await this.queue.add(
      "consolidate-memories",
      { userId, jobRunId: jobRun.id, trigger },
      defaultJobOptions
    );

    const updated = await this.prisma.client.jobRun.update({
      where: { id: jobRun.id },
      data: {
        metadata: {
          ...getObjectMetadata(jobRun.metadata),
          ...(retryMetadata ?? {}),
          trigger,
          queueName: CONSOLIDATION_QUEUE_NAME,
          bullJobId: job.id
        }
      }
    });

    return { job: toJobRunResponse(updated) };
  }

  private async syncScheduledConsolidationJobs() {
    if (!this.queue) {
      return;
    }

    const users = await this.prisma.client.user.findMany({
      where: { consolidationEnabled: true },
      select: { id: true }
    });

    await Promise.all(
      users.map((user) => this.syncScheduledConsolidationJob(user.id, true))
    );
  }

  private async syncScheduledConsolidationJob(
    userId: string,
    enabled: boolean
  ) {
    if (!this.queue) {
      return;
    }

    const schedulerId = consolidationSchedulerId(userId);

    if (!enabled) {
      await this.queue.removeJobScheduler(schedulerId);

      return;
    }

    await this.queue.upsertJobScheduler(
      schedulerId,
      { pattern: apiEnv().CONSOLIDATION_CRON },
      {
        name: "scheduled-consolidation",
        data: { userId, trigger: "scheduled" },
        opts: defaultJobOptions
      }
    );
  }
}
