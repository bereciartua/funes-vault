import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { CategoriesService } from "../memories/categories.service.js";
import { PoliciesController } from "./policies.controller.js";
import { PoliciesService } from "./policies.service.js";
import { PolicyEvaluationService } from "./policy-evaluation.service.js";

/** Exposes owner policy CRUD and exports deterministic evaluation for disclosure and suggestion intake. */
@Module({
  imports: [AuditTrailModule],
  controllers: [PoliciesController],
  providers: [CategoriesService, PoliciesService, PolicyEvaluationService],
  exports: [PoliciesService, PolicyEvaluationService]
})
export class PoliciesModule {}
