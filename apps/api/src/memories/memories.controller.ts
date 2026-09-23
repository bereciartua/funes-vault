import {
  type AuthUser,
  type CreateMemoryRequest,
  createMemoryRequestSchema,
  type ListMemoriesQuery,
  listMemoriesQuerySchema,
  type UpdateMemoryRequest,
  updateMemoryRequestSchema
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
  CreateMemoryRequestDto,
  ListMemoriesResponseDto,
  MemoryProvenanceResponseDto,
  MemoryResponseDto,
  UpdateMemoryRequestDto
} from "./memories.dto.js";
import { MemoriesService } from "./memories.service.js";

@ApiTags("memories")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/memories")
export class MemoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  @Get()
  @ApiOperation({ summary: "List memories for the current user" })
  @ApiQuery({
    name: "query",
    required: false,
    description:
      "Hybrid search across title, body, and semantic similarity when embeddings are available."
  })
  @ApiQuery({ name: "categoryKeys", required: false, isArray: true })
  @ApiQuery({ name: "sensitivity", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "reviewState", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "sort", required: false })
  @ApiQuery({ name: "direction", required: false })
  @ApiOkResponse({ type: ListMemoriesResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query parameters." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listMemoriesQuerySchema))
    query: ListMemoriesQuery
  ) {
    return this.memoriesService.listMemories(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: "Create a memory for the current user" })
  @ApiBody({ type: CreateMemoryRequestDto })
  @ApiCreatedResponse({ type: MemoryResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMemoryRequestSchema))
    body: CreateMemoryRequest
  ) {
    return this.memoriesService.createMemory(user.id, body);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single current-user memory" })
  @ApiOkResponse({ type: MemoryResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Memory not found." })
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.memoriesService.getMemory(user.id, id);
  }

  @Get(":id/provenance")
  @ApiOperation({ summary: "Get append-only provenance for a memory" })
  @ApiOkResponse({ type: MemoryProvenanceResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Memory not found." })
  getProvenance(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.memoriesService.getMemoryProvenance(user.id, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update, archive, or restore a memory" })
  @ApiBody({ type: UpdateMemoryRequestDto })
  @ApiOkResponse({ type: MemoryResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Memory not found." })
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMemoryRequestSchema))
    body: UpdateMemoryRequest
  ) {
    return this.memoriesService.updateMemory(user.id, id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Soft-delete a memory" })
  @ApiOkResponse({ type: MemoryResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Memory not found." })
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.memoriesService.deleteMemory(user.id, id);
  }
}
