import type { AuthUser } from "@funes-vault/shared";
import {
  type CreateClientRequest,
  createClientRequestSchema,
  type ListClientOptionsQuery,
  listClientOptionsQuerySchema,
  type ListClientsQuery,
  listClientsQuerySchema,
  type UpdateClientRequest,
  updateClientRequestSchema
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
  ClientResponseDto,
  CreateClientRequestDto,
  ListClientOptionsResponseDto,
  ListClientsResponseDto,
  UpdateClientRequestDto
} from "./clients.dto.js";
import { ClientsService } from "./clients.service.js";

@ApiTags("clients")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/clients")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get("options")
  @ApiOperation({ summary: "List minimal client options for forms" })
  @ApiQuery({ name: "query", required: false })
  @ApiOkResponse({ type: ListClientOptionsResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query parameters." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  listOptions(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listClientOptionsQuerySchema))
    query: ListClientOptionsQuery
  ) {
    return this.clientsService.listClientOptions(user.id, query);
  }

  @Get()
  @ApiOperation({ summary: "List clients for the current user" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiOkResponse({ type: ListClientsResponseDto })
  @ApiBadRequestResponse({ description: "Invalid query parameters." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listClientsQuerySchema))
    query: ListClientsQuery
  ) {
    return this.clientsService.listClients(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: "Create a client and show its token once" })
  @ApiBody({ type: CreateClientRequestDto })
  @ApiCreatedResponse({ type: ClientResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiConflictResponse({ description: "Client name already exists." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createClientRequestSchema))
    body: CreateClientRequest
  ) {
    return this.clientsService.createClient(user.id, body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a client or rotate its token" })
  @ApiBody({ type: UpdateClientRequestDto })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiBadRequestResponse({ description: "Invalid request body." })
  @ApiConflictResponse({ description: "Client name already exists." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Client not found." })
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClientRequestSchema))
    body: UpdateClientRequest
  ) {
    return this.clientsService.updateClient(user.id, id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a current-user client" })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Client not found." })
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.clientsService.deleteClient(user.id, id);
  }
}
