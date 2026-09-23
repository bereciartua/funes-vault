import { Module } from "@nestjs/common";

import { AuditTrailService } from "./audit-trail.service.js";

/** Exports the transaction-aware writer for audit events, provenance and their subjects. */
@Module({
  providers: [AuditTrailService],
  exports: [AuditTrailService]
})
export class AuditTrailModule {}
