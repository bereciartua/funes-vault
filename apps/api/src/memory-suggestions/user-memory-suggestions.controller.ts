import type { AuthUser } from "@funes-vault/shared";
import {
  type BulkReviewMemorySuggestionsRequest,
  bulkReviewMemorySuggestionsRequestSchema,
  type ListMemorySuggestionsQuery,
  listMemorySuggestionsQuerySchema
} from "@funes-vault/shared";
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import { sessionCookieName } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  BulkReviewMemorySuggestionsRequestDto,
  BulkReviewMemorySuggestionsResponseDto,
  ListMemorySuggestionsResponseDto,
  MemorySuggestionReviewResponseDto
} from "./memory-suggestions.dto.js";
import { SuggestionBulkReviewService } from "./suggestion-bulk-review.service.js";
import { SuggestionReviewService } from "./suggestion-review.service.js";
@ApiTags("memory suggestions")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/memory-suggestions")
export class UserMemorySuggestionsController {
  constructor(
    private readonly suggestionReviewService: SuggestionReviewService,
    private readonly suggestionBulkReviewService: SuggestionBulkReviewService
  ) {}

  @Get()
  @ApiOperation({ summary: "List reviewable memory suggestions" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiOkResponse({ type: ListMemorySuggestionsResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listMemorySuggestionsQuerySchema))
    query: ListMemorySuggestionsQuery
  ) {
    return this.suggestionReviewService.listUserSuggestions(user.id, query);
  }

  @Patch("review")
  @ApiOperation({ summary: "Bulk-review queued memory suggestions" })
  @ApiBody({ type: BulkReviewMemorySuggestionsRequestDto })
  @ApiOkResponse({ type: BulkReviewMemorySuggestionsResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  review(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(bulkReviewMemorySuggestionsRequestSchema))
    body: BulkReviewMemorySuggestionsRequest
  ) {
    return this.suggestionBulkReviewService.bulkReviewUserSuggestions(
      user.id,
      body
    );
  }

  @Patch(":id/apply")
  @ApiOperation({ summary: "Approve a suggestion and create an active memory" })
  @ApiOkResponse({ type: MemorySuggestionReviewResponseDto })
  @ApiConflictResponse({
    description:
      "Suggestion is already reviewed or its source memories changed."
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Memory suggestion not found." })
  apply(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.suggestionReviewService.applyUserSuggestion(user.id, id);
  }

  @Patch(":id/reject")
  @ApiOperation({ summary: "Reject a queued memory suggestion" })
  @ApiOkResponse({ type: MemorySuggestionReviewResponseDto })
  @ApiConflictResponse({
    description:
      "Suggestion is already reviewed or its source memories changed."
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Memory suggestion not found." })
  reject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.suggestionReviewService.rejectUserSuggestion(user.id, id);
  }
}
