import type { AuthUser } from "@funes-vault/shared";
import {
  type PaginationQuery,
  paginationQuerySchema,
  type ReviewDisclosureRequest,
  reviewDisclosureRequestSchema
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
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags
} from "@nestjs/swagger";

import { sessionCookieName } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { DisclosureReviewService } from "./disclosure-review.service.js";
import {
  DisclosurePreviewDto,
  DisclosureReviewListDto,
  ReviewDisclosureDto
} from "./memory-requests.dto.js";

@ApiTags("memory requests")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/memory-request-reviews")
export class DisclosureReviewController {
  constructor(private readonly reviews: DisclosureReviewService) {}

  @Get()
  @ApiOperation({
    summary: "List current-user requests awaiting disclosure approval"
  })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiOkResponse({ type: DisclosureReviewListDto })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery
  ) {
    return this.reviews.list(user.id, query);
  }

  @Get(":id")
  @ApiOperation({
    summary: "Preview exactly which memory text a request may disclose"
  })
  @ApiOkResponse({ type: DisclosurePreviewDto })
  preview(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.reviews.preview(user.id, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Approve selected memories once or deny a request" })
  @ApiBody({ type: ReviewDisclosureDto })
  decide(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reviewDisclosureRequestSchema))
    body: ReviewDisclosureRequest
  ) {
    return this.reviews.decide(user.id, id, body);
  }
}
