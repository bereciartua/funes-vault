import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { FirstPartyAccessModule } from "../first-party-access/first-party-access.module.js";
import { MemorySuggestionsModule } from "../memory-suggestions/memory-suggestions.module.js";
import { CandidateApplier } from "./candidate-applier.js";
import { ExtractionOutcomeWriter } from "./extraction-outcome-writer.js";
import { ExtractionProviderService } from "./extraction-provider.service.js";
import { ExtractionReconciliationService } from "./extraction-reconciliation.service.js";
import { ExtractionRunService } from "./extraction-run.service.js";
import { JevMemoryExtractionProvider } from "./jev-memory-extraction.provider.js";
import { LlmMemoryExtractionProvider } from "./llm-memory-extraction.provider.js";
import { MemoryProcessingController } from "./memory-processing.controller.js";
import { ProcessingCoreModule } from "./processing-core.module.js";
const providers = [
  CandidateApplier,
  ExtractionRunService,
  ExtractionReconciliationService,
  ExtractionProviderService,
  ExtractionOutcomeWriter,
  LlmMemoryExtractionProvider,
  JevMemoryExtractionProvider
];
/** Provides extraction runs, provider calls and reconciliation, and exposes owner processing controls. */
@Module({
  imports: [
    AuditTrailModule,
    ProcessingCoreModule,

    FirstPartyAccessModule,
    MemorySuggestionsModule
  ],
  controllers: [MemoryProcessingController],
  providers,
  exports: [
    ExtractionRunService,
    ExtractionReconciliationService,
    ProcessingCoreModule
  ]
})
export class MemoryProcessingModule {}
