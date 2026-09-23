import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ChatModule } from "./chat/chat.module.js";
import { ClientsModule } from "./clients/clients.module.js";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { DataControlModule } from "./data-control/data-control.module.js";
import { EmbeddingsModule } from "./embeddings/embeddings.module.js";
import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { createLoggerOptions } from "./logging.js";
import { MemoriesModule } from "./memories/memories.module.js";
import { MemoryRequestsModule } from "./memory-requests/memory-requests.module.js";
import { MemorySuggestionsModule } from "./memory-suggestions/memory-suggestions.module.js";
import { OAuthModule } from "./oauth/oauth.module.js";
import { OverviewModule } from "./overview/overview.module.js";
import { PoliciesModule } from "./policies/policies.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { VoiceModule } from "./voice/voice.module.js";

// Lenient global ceiling per client IP; authentication routes carry a much
// stricter override (see AuthController).
/** @internal */
const defaultThrottle = { ttl: 60_000, limit: 300 };

/** Composes the HTTP feature modules, request throttling and shared error handling. */
@Module({
  imports: [
    LoggerModule.forRootAsync({ useFactory: createLoggerOptions }),
    ThrottlerModule.forRoot([defaultThrottle]),
    PrismaModule,
    HealthModule,
    AuthModule,
    ChatModule,
    VoiceModule,
    MemoriesModule,
    MemoryRequestsModule,
    MemorySuggestionsModule,
    ClientsModule,
    EmbeddingsModule,
    OAuthModule,
    OverviewModule,
    PoliciesModule,
    AuditModule,
    DataControlModule,
    JobsModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter }
  ]
})
export class AppModule {}
