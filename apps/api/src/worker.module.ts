import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { EmbeddingsModule } from "./embeddings/embeddings.module.js";
import { JobsRuntimeModule } from "./jobs/jobs-runtime.module.js";
import { createLoggerOptions } from "./logging.js";
import { PrismaModule } from "./prisma/prisma.module.js";

/** Background process: database, providers and queues only, with no HTTP/auth module tree. */
@Module({
  imports: [
    LoggerModule.forRootAsync({ useFactory: createLoggerOptions }),
    PrismaModule,
    EmbeddingsModule,
    JobsRuntimeModule
  ]
})
export class WorkerModule {}
