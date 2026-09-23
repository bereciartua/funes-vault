import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import { ClientAuthGuard } from "../clients/client-auth.guard.js";
import { ListCategoriesResponseDto } from "./memories.dto.js";
import { MemoriesService } from "./memories.service.js";

@ApiTags("categories")
@ApiBearerAuth("client_bearer")
@UseGuards(ClientAuthGuard)
@Controller("v1/memory-categories")
export class ClientCategoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  @Get()
  @ApiOperation({ summary: "List memory categories for client integrations" })
  @ApiOkResponse({ type: ListCategoriesResponseDto })
  @ApiUnauthorizedResponse({ description: "Missing or invalid client token." })
  list() {
    return this.memoriesService.listCategories();
  }
}
