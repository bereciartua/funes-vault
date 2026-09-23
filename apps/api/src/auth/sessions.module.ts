import { Global, Module } from "@nestjs/common";

import { SessionAuthGuard } from "./session-auth.guard.js";
import { SessionsService } from "./sessions.service.js";

/** Shares opaque cookie session resolution and its guard across browser, OAuth and dashboard routes. */
@Global()
@Module({
  providers: [SessionsService, SessionAuthGuard],
  exports: [SessionsService, SessionAuthGuard]
})
export class SessionsModule {}
