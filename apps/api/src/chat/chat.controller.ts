import type { IncomingMessage, ServerResponse } from "node:http";

import type { AuthUser } from "@funes-vault/shared";
import {
  type ChatMessageRequest,
  chatMessageRequestSchema,
  type ChatStreamMessageRequest,
  chatStreamMessageRequestSchema,
  type CreateOnboardingSuggestions,
  createOnboardingSuggestionsSchema,
  type ListChatThreadsQuery,
  listChatThreadsQuerySchema,
  type RenameChatThreadRequest,
  renameChatThreadRequestSchema
} from "@funes-vault/shared";
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import { pipeUIMessageStreamToResponse } from "ai";

import { sessionCookieName } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  ChatMessageRequestDto,
  ChatMessageResponseDto,
  ChatSessionResponseDto,
  ChatThreadResponseDto,
  ChatThreadSummaryDto,
  CreateOnboardingSuggestionsDto,
  GuidedQuestionsResponseDto,
  ListChatThreadsResponseDto,
  OnboardingSuggestionsResponseDto,
  RenameChatThreadRequestDto
} from "./chat.dto.js";
import { ChatService } from "./chat.service.js";
import { ChatThreadsService } from "./chat-threads.service.js";
import { GuidedInterviewService } from "./guided-interview.service.js";

@ApiTags("memory chat")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/chat")
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly threads: ChatThreadsService,
    private readonly interview: GuidedInterviewService
  ) {}

  @Post("messages")
  @ApiOperation({ summary: "Ask memory chat about current-user memories" })
  @ApiBody({ type: ChatMessageRequestDto })
  @ApiCreatedResponse({ type: ChatMessageResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiServiceUnavailableResponse({
    description: "The configured chat model provider is unavailable."
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(chatMessageRequestSchema))
    body: ChatMessageRequest
  ) {
    return this.chatService.sendMessage({ userId: user.id, body });
  }

  @Post("messages/stream")
  @ApiOperation({
    summary: "Stream memory chat with typed workbench events"
  })
  @ApiBody({
    type: ChatMessageRequestDto,
    description:
      "Accepts the Funes chat message body and also tolerates AI SDK UI message request bodies."
  })
  @ApiOkResponse({
    description:
      "Server-sent AI SDK UI message stream containing text chunks and sanitized Funes data parts.",
    content: {
      "text/event-stream": {
        schema: {
          type: "string",
          example: 'data: {"type":"start","messageId":"assistant_abc"}\n\n'
        }
      }
    }
  })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiServiceUnavailableResponse({
    description: "The configured chat model provider is unavailable."
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  async streamMessage(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(chatStreamMessageRequestSchema))
    body: ChatStreamMessageRequest,
    @Req() request: IncomingMessage,
    @Res() response: ServerResponse
  ) {
    const abortController = new AbortController();

    request.on("close", () => {
      if (!response.writableEnded) {
        abortController.abort();
      }
    });

    const stream = await this.chatService.streamMessage({
      userId: user.id,
      body,
      abortSignal: abortController.signal
    });

    pipeUIMessageStreamToResponse({
      response,
      stream
    });
  }

  @Get("session")
  @ApiOperation({
    summary: "Load the latest persisted memory chat session if one exists"
  })
  @ApiOkResponse({ type: ChatSessionResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  currentSession(@CurrentUser() user: AuthUser) {
    return this.threads.getCurrentSession({ userId: user.id });
  }

  @Get("threads")
  @ApiOperation({ summary: "List previous current-user memory chat threads" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiOkResponse({ type: ListChatThreadsResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query parameters." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  listThreads(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listChatThreadsQuerySchema))
    query: ListChatThreadsQuery
  ) {
    return this.threads.listThreads({ userId: user.id, query });
  }

  @Get("threads/:sessionId")
  @ApiOperation({ summary: "Load a specific current-user memory chat thread" })
  @ApiOkResponse({ type: ChatThreadResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Thread not found." })
  getThread(
    @CurrentUser() user: AuthUser,
    @Param("sessionId") sessionId: string
  ) {
    return this.threads.getThread({ userId: user.id, sessionId });
  }

  @Patch("threads/:sessionId")
  @ApiOperation({ summary: "Rename a current-user memory chat thread" })
  @ApiBody({ type: RenameChatThreadRequestDto })
  @ApiOkResponse({ type: ChatThreadSummaryDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Thread not found." })
  renameThread(
    @CurrentUser() user: AuthUser,
    @Param("sessionId") sessionId: string,
    @Body(new ZodValidationPipe(renameChatThreadRequestSchema))
    body: RenameChatThreadRequest
  ) {
    return this.threads.renameThread({
      userId: user.id,
      sessionId,
      body
    });
  }

  @Post("threads")
  @ApiOperation({ summary: "Start a fresh memory chat thread" })
  @ApiCreatedResponse({ type: ChatSessionResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  startThread(@CurrentUser() user: AuthUser) {
    return this.threads.startThread({ userId: user.id });
  }

  @Get("guided-questions")
  @ApiOperation({ summary: "List guided onboarding questions" })
  @ApiOkResponse({ type: GuidedQuestionsResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  guidedQuestions() {
    return this.interview.listGuidedQuestions();
  }

  @Post("onboarding-suggestions")
  @ApiOperation({
    summary: "Convert guided onboarding answers into reviewable suggestions"
  })
  @ApiBody({ type: CreateOnboardingSuggestionsDto })
  @ApiCreatedResponse({ type: OnboardingSuggestionsResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  createOnboardingSuggestions(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOnboardingSuggestionsSchema))
    body: CreateOnboardingSuggestions
  ) {
    return this.interview.createOnboardingSuggestions({
      userId: user.id,
      body
    });
  }
}
