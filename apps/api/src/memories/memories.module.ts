import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { EmbeddingsModule } from "../embeddings/embeddings.module.js";
import { OAuthModule } from "../oauth/oauth.module.js";
import { CategoriesController } from "./categories.controller.js";
import { CategoriesService } from "./categories.service.js";
import { ClientCategoriesController } from "./client-categories.controller.js";
import { MemoriesController } from "./memories.controller.js";
import { MemoriesService } from "./memories.service.js";
import { MemoryProvenanceRecorder } from "./memory-provenance-recorder.js";
import { MemorySearchRepository } from "./memory-search.repository.js";

/** Exposes owner memory and category routes, connecting search, provenance recording and embedding jobs. */
@Module({
  imports: [EmbeddingsModule, OAuthModule, AuditTrailModule],
  controllers: [
    CategoriesController,
    ClientCategoriesController,
    MemoriesController
  ],
  providers: [
    MemoriesService,
    CategoriesService,
    MemoryProvenanceRecorder,
    MemorySearchRepository
  ],
  exports: [MemoriesService]
})
export class MemoriesModule {}
