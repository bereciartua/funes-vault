import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import { sessionCookieName } from "../auth/auth.constants.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ListCategoriesResponseDto } from "./memories.dto.js";
import { MemoriesService } from "./memories.service.js";

@ApiTags("categories")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/categories")
export class CategoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  @Get()
  @ApiOperation({ summary: "List memory categories" })
  @ApiOkResponse({ type: ListCategoriesResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  list() {
    return this.memoriesService.listCategories();
  }
}
