import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { OAuthModule } from "../oauth/oauth.module.js";
import { ClientAuthGuard } from "./client-auth.guard.js";
import { ClientsController } from "./clients.controller.js";
import { ClientsService } from "./clients.service.js";

/** Exposes owner client management and client authentication, with OAuth token revocation on grant changes. */
@Module({
  imports: [AuditTrailModule, OAuthModule],
  controllers: [ClientsController],
  providers: [ClientAuthGuard, ClientsService],
  exports: [ClientAuthGuard, ClientsService]
})
export class ClientsModule {}
