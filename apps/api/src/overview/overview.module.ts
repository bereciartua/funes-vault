import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { OverviewController } from "./overview.controller.js";
import { OverviewService } from "./overview.service.js";

/** Exposes owner dashboard aggregates and recent audit activity without mutating vault data. */
@Module({
  imports: [AuditModule],
  controllers: [OverviewController],
  providers: [OverviewService]
})
export class OverviewModule {}
