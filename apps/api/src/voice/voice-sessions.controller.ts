import type { AuthUser } from "@funes-vault/shared";
import {
  type CreateVoiceSessionRequest,
  createVoiceSessionRequestSchema,
  type EndVoiceSessionRequest,
  endVoiceSessionRequestSchema,
  type VoiceToolCallRequest,
  voiceToolCallRequestSchema,
  type VoiceTurnRequest,
  voiceTurnRequestSchema
} from "@funes-vault/shared";
import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import { sessionCookieName } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  CreateVoiceSessionDto,
  EndVoiceSessionDto,
  VoiceSessionEndedResponseDto,
  VoiceSessionResponseDto,
  VoiceToolCallDto,
  VoiceToolCallResponseDto,
  VoiceTurnDto,
  VoiceTurnResponseDto
} from "./voice-sessions.dto.js";
import { VoiceSessionsService } from "./voice-sessions.service.js";

@ApiTags("voice sessions")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/chat/voice-sessions")
export class VoiceSessionsController {
  constructor(private readonly voiceSessionsService: VoiceSessionsService) {}

  @Post()
  @ApiOperation({
    summary: "Start a realtime voice session",
    description:
      "Mints a short-lived OpenAI Realtime client secret server-side and returns the session configuration. The provider API key never reaches the browser. Voice tool calls run against the dedicated first-party voice client, whose policy caps disclosure sensitivity."
  })
  @ApiBody({ type: CreateVoiceSessionDto })
  @ApiCreatedResponse({ type: VoiceSessionResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Thread not found." })
  @ApiTooManyRequestsResponse({
    description: "Daily voice session cap reached."
  })
  @ApiServiceUnavailableResponse({
    description: "Voice provider unavailable or not configured."
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createVoiceSessionRequestSchema))
    body: CreateVoiceSessionRequest
  ) {
    return this.voiceSessionsService.createVoiceSession({
      userId: user.id,
      body
    });
  }

  @Post(":voiceSessionId/tool-calls")
  @ApiOperation({
    summary: "Execute a memory tool call from a live voice session",
    description:
      "Bridges Realtime data-channel function calls onto the shared memory steward tools. Returns the tool output for the model plus transcript UI events."
  })
  @ApiBody({ type: VoiceToolCallDto })
  @ApiCreatedResponse({ type: VoiceToolCallResponseDto })
  @ApiBadRequestResponse({ description: "Invalid body or unknown tool." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Voice session not found." })
  @ApiConflictResponse({ description: "Voice session has ended." })
  executeToolCall(
    @CurrentUser() user: AuthUser,
    @Param("voiceSessionId") voiceSessionId: string,
    @Body(new ZodValidationPipe(voiceToolCallRequestSchema))
    body: VoiceToolCallRequest
  ) {
    return this.voiceSessionsService.executeToolCall({
      userId: user.id,
      voiceSessionId,
      body
    });
  }

  @Post(":voiceSessionId/turns")
  @ApiOperation({
    summary: "Persist a voice transcript turn into the chat thread",
    description:
      "Voice turns land in the same chat thread records as typed messages, marked with the voice provider disclosure, so the conversation can continue as text."
  })
  @ApiBody({ type: VoiceTurnDto })
  @ApiCreatedResponse({ type: VoiceTurnResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Voice session not found." })
  persistTurn(
    @CurrentUser() user: AuthUser,
    @Param("voiceSessionId") voiceSessionId: string,
    @Body(new ZodValidationPipe(voiceTurnRequestSchema)) body: VoiceTurnRequest
  ) {
    return this.voiceSessionsService.persistTurn({
      userId: user.id,
      voiceSessionId,
      body
    });
  }

  @Patch(":voiceSessionId/end")
  @ApiOperation({ summary: "End a voice session with a reason" })
  @ApiBody({ type: EndVoiceSessionDto })
  @ApiOkResponse({ type: VoiceSessionEndedResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Voice session not found." })
  end(
    @CurrentUser() user: AuthUser,
    @Param("voiceSessionId") voiceSessionId: string,
    @Body(new ZodValidationPipe(endVoiceSessionRequestSchema))
    body: EndVoiceSessionRequest
  ) {
    return this.voiceSessionsService.endVoiceSession({
      userId: user.id,
      voiceSessionId,
      body
    });
  }
}
