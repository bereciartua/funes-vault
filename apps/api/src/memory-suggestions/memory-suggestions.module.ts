import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { ClientsModule } from "../clients/clients.module.js";
import { EmbeddingsModule } from "../embeddings/embeddings.module.js";
import { OAuthModule } from "../oauth/oauth.module.js";
import { PoliciesModule } from "../policies/policies.module.js";
import { CapturesController } from "./captures.controller.js";
import { MemorySuggestionsController } from "./memory-suggestions.controller.js";
import { suggestionProviders } from "./suggestion.providers.js";
import { SuggestionBulkReviewService } from "./suggestion-bulk-review.service.js";
import { SuggestionIntakeService } from "./suggestion-intake.service.js";
import { SuggestionReviewService } from "./suggestion-review.service.js";
import { SuggestionWriterService } from "./suggestion-writer.service.js";
import { UserMemorySuggestionsController } from "./user-memory-suggestions.controller.js";

/** Connects capture and client suggestion intake to owner review and transactional memory writes. */
@Module({
  imports: [
    ClientsModule,
    OAuthModule,
    PoliciesModule,
    EmbeddingsModule,
    AuditTrailModule
  ],
  controllers: [
    CapturesController,
    MemorySuggestionsController,
    UserMemorySuggestionsController
  ],
  providers: suggestionProviders,
  exports: [
    SuggestionIntakeService,
    SuggestionReviewService,
    SuggestionBulkReviewService,
    SuggestionWriterService
  ]
})
export class MemorySuggestionsModule {}
