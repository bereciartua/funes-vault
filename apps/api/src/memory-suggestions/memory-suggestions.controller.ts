import type { AuditTransport, Client } from "@funes-vault/shared";
import {
  type CreateMemorySuggestionRequest,
  createMemorySuggestionRequestSchema,
  oauthScopeSuggest
} from "@funes-vault/shared";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import { ClientAuthGuard } from "../clients/client-auth.guard.js";
import { RequireClientScope } from "../clients/client-scope.decorator.js";
import {
  CurrentClient,
  CurrentClientUserId
} from "../clients/current-client.decorator.js";
import { RequestAuditTransport } from "../clients/mcp-transport.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  CreateMemorySuggestionDto,
  MemorySuggestionResponseDto
} from "./memory-suggestions.dto.js";
import { SuggestionIntakeService } from "./suggestion-intake.service.js";

@ApiTags("memory suggestions")
@ApiBearerAuth("client_bearer")
@UseGuards(ClientAuthGuard)
@Controller("v1/memory-suggestions")
export class MemorySuggestionsController {
  constructor(
    private readonly suggestionIntakeService: SuggestionIntakeService
  ) {}

  @Post()
  @RequireClientScope(oauthScopeSuggest)
  @ApiOperation({ summary: "Create a reviewable memory suggestion" })
  @ApiBody({ type: CreateMemorySuggestionDto })
  @ApiCreatedResponse({ type: MemorySuggestionResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid client token." })
  create(
    @CurrentClient() client: Client,
    @CurrentClientUserId() userId: string,
    @RequestAuditTransport() transport: AuditTransport,
    @Body(new ZodValidationPipe(createMemorySuggestionRequestSchema))
    body: CreateMemorySuggestionRequest
  ) {
    return this.suggestionIntakeService.createSuggestion({
      userId,
      clientId: client.id,
      transport,
      body
    });
  }
}
