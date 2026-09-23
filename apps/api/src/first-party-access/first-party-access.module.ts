import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { FirstPartyAccessService } from "./first-party-access.service.js";

/** Exports creation of the built-in chat and voice clients and their audited access policies. */
@Module({
  imports: [AuditTrailModule],
  providers: [FirstPartyAccessService],
  exports: [FirstPartyAccessService]
})
export class FirstPartyAccessModule {}
