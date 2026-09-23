import "reflect-metadata";
import "./env.js";

import { writeFileSync } from "node:fs";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger as PinoLogger } from "nestjs-pino";

import { bootstrapFailure } from "./common/bootstrap.js";
import { selectWorkerProcess } from "./common/worker-startup.js";
import { apiEnv, validateEnvironment } from "./config.js";
import { WorkerModule } from "./worker.module.js";

const heartbeatIntervalMs = 15_000;

async function bootstrap() {
  selectWorkerProcess();
  validateEnvironment();

  const heartbeatFile = apiEnv().WORKER_HEARTBEAT_FILE;
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true
  });
  app.useLogger(app.get(PinoLogger));
  const logger = new Logger("Worker");
  const heartbeat = () => {
    writeFileSync(heartbeatFile, new Date().toISOString());
  };
  const interval = setInterval(heartbeat, heartbeatIntervalMs);

  heartbeat();
  logger.log("Funes Vault worker started");

  async function shutdown(signal: string) {
    logger.log(`Received ${signal}; stopping worker`);
    clearInterval(interval);
    await app.close();
    process.exit(0);
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((error: unknown) => bootstrapFailure("Worker", error));
