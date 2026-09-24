import {
  type CreateCaptureRequest,
  createCaptureRequestSchema,
  oauthScopeSuggest
} from "@funes-vault/shared";
import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import { sessionCookieName } from "../auth/auth.constants.js";
import type { FunesRequest } from "../auth/auth.types.js";
import { RequireClientScope } from "../clients/client-scope.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { captureActor, CaptureAuthGuard } from "./capture-auth.guard.js";
import { CaptureResponseDto, CreateCaptureDto } from "./captures.dto.js";
import { SuggestionIntakeService } from "./suggestion-intake.service.js";

@ApiTags("captures")
@ApiCookieAuth(sessionCookieName)
@ApiBearerAuth("client_bearer")
@UseGuards(CaptureAuthGuard)
@Controller("v1/captures")
export class CapturesController {
  constructor(
    private readonly suggestionIntakeService: SuggestionIntakeService
  ) {}

  @Post()
  @RequireClientScope(oauthScopeSuggest)
  @ApiOperation({
    summary: "Quick-capture a text note as a reviewable memory suggestion",
    description:
      "Capture-only variant of memory suggestions: raw text in, a QUEUED_FOR_REVIEW suggestion out. Never creates a memory directly. Accepts the web session cookie (PWA capture queue) or a registered client bearer token (OS shortcuts). Idempotent by captureId."
  })
  @ApiBody({ type: CreateCaptureDto })
  @ApiCreatedResponse({ type: CaptureResponseDto })
  @ApiBadRequestResponse({
    description: "Invalid request body or secret-like content."
  })
  @ApiUnauthorizedResponse({
    description: "Missing or invalid session cookie or client token."
  })
  create(
    @Req() request: FunesRequest,
    @Body(new ZodValidationPipe(createCaptureRequestSchema))
    body: CreateCaptureRequest
  ) {
    const actor = captureActor(request);

    return this.suggestionIntakeService.createCapture({
      userId: actor.userId,
      clientId: actor.clientId,
      body
    });
  }
}
