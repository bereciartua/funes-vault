import { Module } from "@nestjs/common";

import { FirstPartyAccessModule } from "../first-party-access/first-party-access.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { GoogleProvider } from "./google.provider.js";
import { GoogleLoginController } from "./google-login.controller.js";
import { GoogleLoginService } from "./google-login.service.js";
import { SessionsModule } from "./sessions.module.js";

/** Provides Google sign-in, profile and account controls, using shared sessions and first-party grants. */
@Module({
  imports: [FirstPartyAccessModule, SessionsModule],
  controllers: [AuthController, GoogleLoginController],
  providers: [AuthService, GoogleProvider, GoogleLoginService],
  exports: [AuthService, SessionsModule]
})
export class AuthModule {}
