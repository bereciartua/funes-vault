import type { AuthUser } from "@funes-vault/shared";
import {
  type CreatePolicyRequest,
  createPolicyRequestSchema,
  type ListPoliciesQuery,
  listPoliciesQuerySchema,
  type UpdatePolicyRequest,
  updatePolicyRequestSchema
} from "@funes-vault/shared";
import {
  Body,
  Controller,
  Delete,
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
  CreatePolicyRequestDto,
  ListPoliciesResponseDto,
  PolicyResponseDto,
  UpdatePolicyRequestDto
} from "./policies.dto.js";
import { PoliciesService } from "./policies.service.js";

@ApiTags("policies")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/policies")
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get()
  @ApiOperation({ summary: "List policies for the current user" })
  @ApiQuery({ name: "clientId", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiOkResponse({ type: ListPoliciesResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query parameters." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listPoliciesQuerySchema))
    query: ListPoliciesQuery
  ) {
    return this.policiesService.listPolicies(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: "Create a client access policy" })
  @ApiBody({ type: CreatePolicyRequestDto })
  @ApiCreatedResponse({ type: PolicyResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiConflictResponse({
    description: "This app already has permissions"
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPolicyRequestSchema))
    body: CreatePolicyRequest
  ) {
    return this.policiesService.createPolicy(user.id, body);
  }

  @Post("defaults/:clientId")
  @ApiOperation({
    summary: "Restore default permissions on an existing first-party app"
  })
  @ApiCreatedResponse({ type: PolicyResponseDto })
  @ApiConflictResponse({ description: "This app already has permissions" })
  @ApiBadRequestResponse({
    description: "This app has no first-party defaults"
  })
  @ApiNotFoundResponse({ description: "App not found" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  restore(@CurrentUser() user: AuthUser, @Param("clientId") clientId: string) {
    return this.policiesService.restoreDefaults(user.id, clientId);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a client access policy" })
  @ApiBody({ type: UpdatePolicyRequestDto })
  @ApiOkResponse({ type: PolicyResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Policy not found." })
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePolicyRequestSchema))
    body: UpdatePolicyRequest
  ) {
    return this.policiesService.updatePolicy(user.id, id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a client access policy" })
  @ApiOkResponse({ type: PolicyResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Policy not found." })
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.policiesService.deletePolicy(user.id, id);
  }
}
