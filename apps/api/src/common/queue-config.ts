import type { ConnectionOptions } from "bullmq";

import { apiEnv } from "../config.js";

export const EMBEDDING_QUEUE_NAME = "funes-vault-embedding-generation";
export const CONSOLIDATION_QUEUE_NAME = "funes-vault-consolidation";

export function redisConnectionOptions(
  worker = false
): ConnectionOptions | null {
  const redisUrl = apiEnv().REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  return {
    url: redisUrl,
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 2000,
    ...(worker ? {} : { commandTimeout: 2500 })
  };
}

export function shouldRunJobWorkers() {
  return apiEnv().JOB_WORKER_ENABLED ?? true;
}

const maxJobAttempts = 3;
export const defaultJobOptions = {
  attempts: maxJobAttempts,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500
};
