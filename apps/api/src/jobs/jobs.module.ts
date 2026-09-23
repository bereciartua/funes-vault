import { Module } from "@nestjs/common";

import { JobsController } from "./jobs.controller.js";
import { JobsRuntimeModule } from "./jobs-runtime.module.js";

/** Authenticated JobRun and queue controls; every operation scopes records to the owner. */
@Module({
  imports: [JobsRuntimeModule],
  controllers: [JobsController],
  exports: [JobsRuntimeModule]
})
export class JobsModule {}
