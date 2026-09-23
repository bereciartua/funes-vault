import { Module } from "@nestjs/common";

import { AuditTrailModule } from "../audit-trail/audit-trail.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { OAuthClientsStoreService } from "./oauth-clients-store.service.js";
import { OAuthConsentController } from "./oauth-consent.controller.js";
import { OAuthGrantsService } from "./oauth-grants.service.js";
import { OAuthProviderService } from "./oauth-provider.service.js";
import { OAuthTokensService } from "./oauth-tokens.service.js";

/** Provides connector registration, consent grants and opaque tokens for the mounted OAuth protocol routes. */
@Module({
  imports: [AuditTrailModule, AuthModule],
  controllers: [OAuthConsentController],
  providers: [
    OAuthClientsStoreService,
    OAuthGrantsService,
    OAuthProviderService,
    OAuthTokensService
  ],
  exports: [OAuthProviderService, OAuthTokensService]
})
export class OAuthModule {}
