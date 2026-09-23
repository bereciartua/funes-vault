import type { AuthUser } from "@funes-vault/shared";
import {
  type ListJobsQuery,
  listJobsQuerySchema,
  type UpdateConsolidationSettingsRequest,
  updateConsolidationSettingsRequestSchema
} from "@funes-vault/shared";
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import { sessionCookieName } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  ConsolidationSettingsResponseDto,
  JobRunResponseDto,
  ListJobsResponseDto,
  UpdateConsolidationSettingsDto
} from "./jobs.dto.js";
import { JobsService } from "./jobs.service.js";

@ApiTags("jobs")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get("consolidation-settings")
  @ApiOperation({ summary: "Get current-user consolidation settings" })
  @ApiOkResponse({ type: ConsolidationSettingsResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  getConsolidationSettings(@CurrentUser() user: AuthUser) {
    return this.jobsService.getConsolidationSettings(user.id);
  }

  @Patch("consolidation-settings")
  @ApiOperation({ summary: "Update current-user consolidation settings" })
  @ApiBody({ type: UpdateConsolidationSettingsDto })
  @ApiOkResponse({ type: ConsolidationSettingsResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  updateConsolidationSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateConsolidationSettingsRequestSchema))
    body: UpdateConsolidationSettingsRequest
  ) {
    return this.jobsService.updateConsolidationSettings(user.id, body);
  }

  @Post("consolidation-runs")
  @ApiOperation({ summary: "Start a manual consolidation run" })
  @ApiCreatedResponse({ type: JobRunResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  startConsolidationRun(@CurrentUser() user: AuthUser) {
    return this.jobsService.enqueueConsolidationRun(user.id);
  }

  @Get()
  @ApiOperation({ summary: "List current-user job runs" })
  @ApiQuery({ name: "type", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiOkResponse({ type: ListJobsResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query parameters." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listJobsQuerySchema)) query: ListJobsQuery
  ) {
    return this.jobsService.listJobs(user.id, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a current-user job run" })
  @ApiOkResponse({ type: JobRunResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Job run not found." })
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.jobsService.getJob(user.id, id);
  }

  @Patch(":id/retry")
  @ApiOperation({ summary: "Retry a failed or cancelled job run" })
  @ApiOkResponse({ type: JobRunResponseDto })
  @ApiConflictResponse({ description: "Job state does not permit retry." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Job run not found." })
  retry(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.jobsService.retryJob(user.id, id);
  }
}
