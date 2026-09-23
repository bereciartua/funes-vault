import "reflect-metadata";

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { NestFactory } from "@nestjs/core";

// Export metadata without starting listeners, jobs, or database connections.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://docs:docs@127.0.0.1:1/docs_test";
delete process.env.REDIS_URL;
process.env.JOB_WORKER_ENABLED = "false";
process.env.BULL_BOARD_ENABLED = "false";
const { AppModule } = await import("../src/app.module.js");
const { createOpenApiDocument } = await import("../src/openapi.js");
const app = await NestFactory.create(AppModule, {
  logger: false,
  abortOnError: false
});
try {
  const document = createOpenApiDocument(app);
  // Keep output deterministic; controller declaration order remains reviewable.
  await writeFile(
    resolve("docs/openapi.json"),
    `${JSON.stringify(document, null, 2)}\n`
  );
} finally {
  await app.close();
}
