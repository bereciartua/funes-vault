import type { AuthUser } from "@funes-vault/shared";
import {
  type ProcessingConsentRequest,
  processingConsentRequestSchema
} from "@funes-vault/shared";
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import { sessionCookieName } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ExtractionRunService } from "./extraction-run.service.js";
import { MemoryProcessingConfigService } from "./memory-processing-config.service.js";
import { ProcessingPermissionService } from "./processing-permission.service.js";
@ApiTags("memory processing")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/memory-processing")
export class MemoryProcessingController {
  constructor(
    private readonly config: MemoryProcessingConfigService,
    private readonly permission: ProcessingPermissionService,
    private readonly extractionRunService: ExtractionRunService
  ) {}

  @Get("capabilities")
  @ApiOperation({
    summary:
      "Read effective memory processors and current user's processing permissions"
  })
  @ApiOkResponse({
    description:
      "Sanitized effective configuration, fingerprint and versioned consent scopes."
  })
  async capabilities(@CurrentUser() user: AuthUser) {
    return {
      ...this.config.effective,
      consentVersion: 1,
      consents: await this.permission.listConsents(user.id)
    };
  }

  @Post("consent")
  @ApiOperation({ summary: "Grant or revoke TypeSafe processing for one task" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["scope", "granted", "version"],
      properties: {
        scope: { enum: ["extraction", "consolidation"] },
        granted: { type: "boolean" },
        version: { type: "integer", enum: [1] }
      }
    }
  })
  consent(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(processingConsentRequestSchema))
    request: ProcessingConsentRequest
  ) {
    return this.permission.setConsent(user.id, request.scope, request.granted);
  }

  @Get("sources/:sourceId")
  @ApiOperation({
    summary: "Read durable extraction results for an owned source turn"
  })
  result(@CurrentUser() user: AuthUser, @Param("sourceId") sourceId: string) {
    return this.extractionRunService.result(user.id, sourceId);
  }

  @Post("sources/:sourceId/reprocess")
  @ApiOperation({
    summary:
      "Explicitly reprocess a failed or skipped source with the current configuration; separately audited"
  })
  reprocess(
    @CurrentUser() user: AuthUser,
    @Param("sourceId") sourceId: string
  ) {
    return this.extractionRunService.reprocess(user.id, sourceId);
  }

  @Post("sources/:sourceId/retry")
  @ApiOperation({
    summary: "Retry incomplete extraction using its original configuration"
  })
  retry(@CurrentUser() user: AuthUser, @Param("sourceId") sourceId: string) {
    return this.extractionRunService.retry(user.id, sourceId);
  }
}
