import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { EmbeddingsModule } from "../embeddings/embeddings.module.js";
import { OAuthModule } from "../oauth/oauth.module.js";
import { PoliciesModule } from "../policies/policies.module.js";
import { BundleCompilerService } from "./bundle-compiler.service.js";
import { DisclosureReviewController } from "./disclosure-review.controller.js";
import { DisclosureReviewService } from "./disclosure-review.service.js";
import { MemoryRequestsController } from "./memory-requests.controller.js";
import { MemoryRequestsService } from "./memory-requests.service.js";
import { RetrievalService } from "./retrieval.service.js";

/** Combines retrieval, policy evaluation and bundle compilation with owner review of exact disclosures. */
@Module({
  imports: [EmbeddingsModule, OAuthModule, PoliciesModule, AuditTrailModule],
  controllers: [MemoryRequestsController, DisclosureReviewController],
  providers: [
    DisclosureReviewService,
    BundleCompilerService,
    MemoryRequestsService,
    RetrievalService
  ],
  exports: [MemoryRequestsService, RetrievalService]
})
export class MemoryRequestsModule {}
