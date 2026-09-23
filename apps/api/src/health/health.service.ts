import { Injectable, Logger } from "@nestjs/common";

import { withDeadline } from "../common/deadline.js";
import { errorMessage } from "../common/errors.js";
import { EmbeddingJobsService } from "../embeddings/embedding-jobs.service.js";
import { JobsService } from "../jobs/jobs.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

type CheckStatus = "ok" | "down" | "skipped";
type OverallStatus = "ok" | "degraded" | "down";

type HealthCheck = {
  status: CheckStatus;
  message?: string;
};

function toMessage(error: unknown) {
  return errorMessage(error, "Unknown error");
}

/**
 * Owns liveness and dependency health probes.
 * Tenant boundary: probes disclose infrastructure status without reading user records.
 * Audit: read-only infrastructure; no audit or provenance writes.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingJobs: EmbeddingJobsService,
    private readonly jobs: JobsService
  ) {}

  getLiveHealth() {
    return {
      status: "ok" as const,
      service: "funes-vault-api",
      timestamp: new Date().toISOString()
    };
  }

  async getReadyHealth() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis()
    ]);
    const embeddingWorker = this.embeddingJobs.getRuntimeStatus();
    const consolidationWorker = this.jobs.getRuntimeStatus();
    const workerStatus = this.getWorkerStatus([
      embeddingWorker,
      consolidationWorker
    ]);
    const checks = {
      api: { status: "ok" as const },
      database,
      redis,
      worker: {
        status: workerStatus,
        embedding: embeddingWorker,
        consolidation: consolidationWorker
      }
    };
    const readinessChecks = [
      checks.api,
      checks.database,
      checks.redis,
      ...(workerStatus === "skipped" ? [] : [{ status: workerStatus }])
    ];

    return {
      status: this.getOverallStatus(readinessChecks),
      service: "funes-vault-api",
      timestamp: new Date().toISOString(),
      checks
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    try {
      await withDeadline(this.prisma.client.$queryRaw`SELECT 1`, 3000);

      return { status: "ok" };
    } catch (error) {
      // Driver errors can include hosts and connection details; keep them
      // out of the public readiness payload.
      this.logger.warn(`Database readiness check failed: ${toMessage(error)}`);

      return { status: "down", message: "unreachable" };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    const queues = [this.embeddingJobs.getQueue(), this.jobs.getQueue()].filter(
      (queue) => queue !== null
    );
    if (queues.length === 0) {
      return { status: "skipped", message: "REDIS_URL is not configured" };
    }

    try {
      await withDeadline(
        Promise.all(queues.map((queue) => queue.getJobCounts("waiting"))),
        3000
      );

      return { status: "ok" };
    } catch (error) {
      this.logger.warn(`Redis readiness check failed: ${toMessage(error)}`);

      return { status: "down", message: "unreachable" };
    }
  }

  private getWorkerStatus(
    workers: Array<{
      queueConfigured: boolean;
      workerEnabled: boolean;
      workerRunning: boolean;
    }>
  ): CheckStatus {
    if (workers.every((worker) => !worker.workerEnabled)) {
      return "skipped";
    }

    if (
      workers.every((worker) => worker.queueConfigured && worker.workerRunning)
    ) {
      return "ok";
    }

    return "down";
  }

  private getOverallStatus(
    checks: Array<{ status: CheckStatus }>
  ): OverallStatus {
    if (checks.some((check) => check.status === "down")) {
      return "down";
    }

    if (checks.some((check) => check.status === "skipped")) {
      return "degraded";
    }

    return "ok";
  }
}
