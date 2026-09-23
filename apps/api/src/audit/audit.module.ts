import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";

/** Exposes owner-scoped audit history and event details through the read-only AuditService. */
@Module({
  imports: [AuditTrailModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService]
})
export class AuditModule {}
