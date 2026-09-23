import { Module } from "@nestjs/common";

import { ConsolidationModule } from "../consolidation/consolidation.module.js";
import { EmbeddingsModule } from "../embeddings/embeddings.module.js";
import { JobsService } from "./jobs.service.js";

/** Queue lifecycle and job bookkeeping shared by HTTP and worker processes; no routes. */
@Module({
  imports: [ConsolidationModule, EmbeddingsModule],
  providers: [JobsService],
  exports: [JobsService]
})
export class JobsRuntimeModule {}
