import "reflect-metadata";
import "./env.js";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";
import { bootstrapFailure } from "./common/bootstrap.js";
import { apiEnv, validateEnvironment } from "./config.js";

async function bootstrap() {
  validateEnvironment();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  // Let SIGTERM run onModuleDestroy hooks: Prisma disconnects and BullMQ
  // workers finish their in-flight jobs instead of being killed mid-run.
  app.enableShutdownHooks();

  await app.listen(apiEnv().API_PORT);
}

bootstrap().catch((error: unknown) => bootstrapFailure("API", error));
