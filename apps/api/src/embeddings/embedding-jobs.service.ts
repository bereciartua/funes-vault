import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType,
  JobStatus,
  JobType,
  type Prisma
} from "@funes-vault/db";
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";

import { AuditTrailService } from "../audit-trail/audit-trail.service.js";
import { errorMessage } from "../common/errors.js";
import {
  defaultJobOptions,
  EMBEDDING_QUEUE_NAME,
  redisConnectionOptions,
  shouldRunJobWorkers
} from "../common/queue-config.js";
import { initializeWorker } from "../common/worker-startup.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { EmbeddingsService } from "./embeddings.service.js";

type EmbeddingJobData = {
  userId: string;
  memoryId: string;
  jobRunId: string;
};

/**
 * Owns embedding queue production and worker outcomes.
 * Tenant boundary: memory lookup is scoped to the job owner and sensitivity ceiling.
 * Audit: workers record completion or failure through AuditTrailService; providers receive only eligible text.
 */
@Injectable()
export class EmbeddingJobsService implements OnModuleInit, OnModuleDestroy {
  private workerReady = false;
  private readonly logger = new Logger(EmbeddingJobsService.name);
  private queue: Queue<EmbeddingJobData> | null = null;
  private worker: Worker<EmbeddingJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly auditTrail: AuditTrailService
  ) {}

  getQueue() {
    const connection = redisConnectionOptions();
    if (!this.queue && connection) {
      this.queue = new Queue<EmbeddingJobData>(EMBEDDING_QUEUE_NAME, {
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
        "REDIS_URL is not configured; embedding jobs will be recorded but not enqueued"
      );

      return;
    }

    // Producers initialize in the background: Redis failure affects readiness, not liveness.
    this.getQueue();

    if (!shouldRunJobWorkers()) {
      this.logger.log(
        "JOB_WORKER_ENABLED is false; embedding queue producer is enabled without a worker"
      );

      return;
    }

    this.worker = new Worker<EmbeddingJobData>(
      EMBEDDING_QUEUE_NAME,
      async (job) => this.process(job.data),
      { connection: redisConnectionOptions(true)! }
    );
    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Embedding job ${job?.id ?? "unknown"} failed: ${error.message}`
      );
    });
    this.worker.on("error", () =>
      this.logger.warn("Redis worker connection unavailable")
    );
    const ready = this.worker.waitUntilReady().then(() => {
      this.workerReady = true;
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

  async enqueueMemoryEmbedding(input: {
    userId: string;
    memoryId: string;
    reason: "memory_created" | "memory_updated" | "manual_regeneration";
  }) {
    const jobRun = await this.prisma.client.jobRun.create({
      data: {
        userId: input.userId,
        type: JobType.GENERATE_EMBEDDING,
        status: JobStatus.QUEUED,
        maxAttempts: defaultJobOptions.attempts,
        metadata: {
          memoryId: input.memoryId,
          reason: input.reason
        }
      }
    });

    if (!this.queue) {
      await this.prisma.client.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: JobStatus.CANCELLED,
          error: "REDIS_URL is not configured"
        }
      });

      return { jobRunId: jobRun.id, queued: false };
    }

    const job = await this.queue.add(
      "generate-memory-embedding",
      {
        userId: input.userId,
        memoryId: input.memoryId,
        jobRunId: jobRun.id
      },
      defaultJobOptions
    );

    await this.prisma.client.jobRun.update({
      where: { id: jobRun.id },
      data: {
        metadata: {
          memoryId: input.memoryId,
          reason: input.reason,
          queueName: EMBEDDING_QUEUE_NAME,
          bullJobId: job.id
        }
      }
    });

    return { jobRunId: jobRun.id, queued: true };
  }

  private async process(data: EmbeddingJobData) {
    await this.prisma.client.jobRun.update({
      where: { id: data.jobRunId },
      data: {
        status: JobStatus.RUNNING,
        attempts: { increment: 1 },
        startedAt: new Date()
      }
    });

    try {
      const result = await this.embeddingsService.generateForMemory(data);

      await this.prisma.client.$transaction(async (tx) => {
        await tx.jobRun.update({
          where: { id: data.jobRunId },
          data: {
            status: JobStatus.SUCCEEDED,
            metadata: {
              memoryId: data.memoryId,
              result
            } as Prisma.InputJsonValue,
            finishedAt: new Date()
          }
        });

        await this.auditTrail.createAuditEvent(tx, {
          userId: data.userId,
          type: AuditEventType.JOB_COMPLETED,
          actorType: AuditActorType.JOB,
          actorId: data.jobRunId,
          metadata: {
            jobRunId: data.jobRunId,
            memoryId: data.memoryId,
            result
          },
          subjects: this.embeddingJobSubjects(data)
        });
      });
    } catch (error) {
      const message = errorMessage(error, "Unknown error");

      await this.prisma.client.$transaction(async (tx) => {
        await tx.jobRun.update({
          where: { id: data.jobRunId },
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
          actorId: data.jobRunId,
          metadata: {
            jobRunId: data.jobRunId,
            memoryId: data.memoryId,
            error: message
          },
          subjects: this.embeddingJobSubjects(data)
        });
      });

      throw error;
    }
  }

  private embeddingJobSubjects(data: EmbeddingJobData) {
    return [
      {
        type: AuditSubjectType.JOB_RUN,
        id: data.jobRunId,
        role: AuditSubjectRole.JOB,
        label: JobType.GENERATE_EMBEDDING
      },
      {
        type: AuditSubjectType.MEMORY,
        id: data.memoryId,
        role: AuditSubjectRole.TARGET
      }
    ];
  }
}
