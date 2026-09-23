import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { ProcessingCoreModule } from "../memory-processing/processing-core.module.js";
import {
  JevMemoryConsolidationProvider,
  LlmMemoryConsolidationProvider
} from "./consolidation.providers.js";
import { ConsolidationRepository } from "./consolidation.repository.js";
import { ConsolidationCandidatesService } from "./consolidation-candidates.service.js";
import { ConsolidationJobService } from "./consolidation-job.service.js";
import { ConsolidationLlmService } from "./consolidation-llm.service.js";
import { ConsolidationOrchestratorService } from "./consolidation-orchestrator.service.js";
import { ConsolidationWriterService } from "./consolidation-writer.service.js";

/** Tenant-scoped candidate discovery, provider judgment and reviewable consolidation writes. */
@Module({
  imports: [AuditTrailModule, ProcessingCoreModule],
  providers: [
    ConsolidationOrchestratorService,
    ConsolidationWriterService,
    ConsolidationRepository,
    ConsolidationCandidatesService,
    ConsolidationLlmService,
    ConsolidationJobService,
    JevMemoryConsolidationProvider,
    LlmMemoryConsolidationProvider
  ],
  exports: [ConsolidationJobService]
})
export class ConsolidationModule {}
