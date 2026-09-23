import type { AuthUser } from "@funes-vault/shared";
import {
  type ListAuditEventsQuery,
  listAuditEventsQuerySchema
} from "@funes-vault/shared";
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
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
  AuditEventResponseDto,
  ListAuditEventsResponseDto
} from "./audit.dto.js";
import { AuditService } from "./audit.service.js";

@ApiTags("audit-events")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/audit-events")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: "List audit events for the current user" })
  @ApiQuery({ name: "type", required: false })
  @ApiQuery({ name: "clientId", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiOkResponse({ type: ListAuditEventsResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listAuditEventsQuerySchema))
    query: ListAuditEventsQuery
  ) {
    return this.auditService.listEvents(user.id, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single current-user audit event" })
  @ApiOkResponse({ type: AuditEventResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  @ApiNotFoundResponse({ description: "Audit event not found." })
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.auditService.getEvent(user.id, id);
  }
}
