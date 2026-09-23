import type { AuthUser } from "@funes-vault/shared";
import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import { sessionCookieName } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { OverviewResponseDto } from "./overview.dto.js";
import { OverviewService } from "./overview.service.js";

@ApiTags("overview")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/overview")
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get()
  @ApiOperation({ summary: "Get vault overview aggregates" })
  @ApiOkResponse({ type: OverviewResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  getOverview(@CurrentUser() user: AuthUser) {
    return this.overviewService.getOverview(user.id);
  }
}
