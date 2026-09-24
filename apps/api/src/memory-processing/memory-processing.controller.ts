import type { AuthUser } from "@funes-vault/shared";
import {
  type ProcessingProviderRequest,
  processingProviderRequestSchema
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
@ApiTags("memory processing")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/memory-processing")
export class MemoryProcessingController {
  constructor(
    private readonly config: MemoryProcessingConfigService,
    private readonly extractionRunService: ExtractionRunService
  ) {}

  @Get("capabilities")
  @ApiOperation({
    summary: "Read available providers and the current user's task selections"
  })
  @ApiOkResponse({
    description: "Sanitized effective configuration and provider availability."
  })
  async capabilities(@CurrentUser() user: AuthUser) {
    return {
      ...(await this.config.forUser(user.id)),
      options: this.config.options
    };
  }

  @Post("provider")
  @ApiOperation({ summary: "Select a memory processing provider for one task" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["scope", "system"],
      properties: {
        scope: { enum: ["extraction", "consolidation"] },
        system: { enum: ["system_1", "system_2"] }
      }
    }
  })
  async provider(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(processingProviderRequestSchema))
    request: ProcessingProviderRequest
  ) {
    await this.config.setProvider(user.id, request.scope, request.system);

    return this.capabilities(user);
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
