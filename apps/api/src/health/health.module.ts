import { Module } from "@nestjs/common";

import { EmbeddingsModule } from "../embeddings/embeddings.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";
/** Process and dependency health; probes disclose no owner data or credentials. */
@Module({
  imports: [JobsModule, EmbeddingsModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
