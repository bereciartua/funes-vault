import type { AuditTransport, Client } from "@funes-vault/shared";
import {
  type CreateMemoryBundleRequest,
  createMemoryBundleRequestSchema,
  oauthScopeRead
} from "@funes-vault/shared";
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
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
import { DisclosureReviewService } from "./disclosure-review.service.js";
import {
  CreateMemoryBundleRequestDto,
  MemoryBundleResponseDto
} from "./memory-requests.dto.js";
import { MemoryRequestsService } from "./memory-requests.service.js";

@ApiTags("memory requests")
@ApiBearerAuth("client_bearer")
@UseGuards(ClientAuthGuard)
@Controller("v1/memory-requests")
export class MemoryRequestsController {
  constructor(
    private readonly memoryRequestsService: MemoryRequestsService,
    private readonly reviews: DisclosureReviewService
  ) {}

  @Get(":id/result")
  @RequireClientScope(oauthScopeRead)
  @ApiOperation({
    summary:
      "Retrieve a request status and consume its one-time approved bundle"
  })
  @ApiOkResponse({ type: MemoryBundleResponseDto })
  result(
    @CurrentClient() client: Client,
    @CurrentClientUserId() userId: string,
    @Param("id") id: string,
    @RequestAuditTransport() transport: AuditTransport
  ) {
    return this.reviews.result(userId, client.id, id, transport);
  }

  @Post()
  @RequireClientScope(oauthScopeRead)
  @ApiOperation({ summary: "Request a policy-filtered memory bundle" })
  @ApiBody({ type: CreateMemoryBundleRequestDto })
  @ApiCreatedResponse({ type: MemoryBundleResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid client token." })
  create(
    @CurrentClient() client: Client,
    @CurrentClientUserId() userId: string,
    @RequestAuditTransport() transport: AuditTransport,
    @Body(new ZodValidationPipe(createMemoryBundleRequestSchema))
    body: CreateMemoryBundleRequest
  ) {
    return this.memoryRequestsService.createBundleRequest({
      userId,
      clientId: client.id,
      transport,
      body
    });
  }
}
