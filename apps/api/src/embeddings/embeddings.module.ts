import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { EmbeddingJobsService } from "./embedding-jobs.service.js";
import {
  EMBEDDINGS_PROVIDER,
  OpenAIEmbeddingsProvider
} from "./embeddings.provider.js";
import { EmbeddingsService } from "./embeddings.service.js";

/** Provides embedding generation and its BullMQ producer/worker lifecycle with an injectable provider. */
@Module({
  imports: [AuditTrailModule],
  providers: [
    EmbeddingJobsService,
    EmbeddingsService,
    {
      provide: EMBEDDINGS_PROVIDER,
      useClass: OpenAIEmbeddingsProvider
    }
  ],
  exports: [EmbeddingJobsService, EmbeddingsService, EMBEDDINGS_PROVIDER]
})
export class EmbeddingsModule {}
