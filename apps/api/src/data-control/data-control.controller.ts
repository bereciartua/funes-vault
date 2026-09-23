import type { AuthUser } from "@funes-vault/shared";
import {
  type ExportVaultQuery,
  exportVaultQuerySchema,
  type ImportVaultPreviewRequest,
  importVaultPreviewRequestSchema,
  type ImportVaultRequest,
  importVaultRequestSchema
} from "@funes-vault/shared";
import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
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
  ImportVaultPreviewRequestDto,
  ImportVaultPreviewResponseDto,
  ImportVaultRequestDto,
  ImportVaultResponseDto,
  VaultExportResponseDto
} from "./data-control.dto.js";
import { VaultExportService } from "./vault-export.service.js";
import { VaultImportService } from "./vault-import.service.js";

@ApiTags("data-control")
@ApiCookieAuth(sessionCookieName)
@UseGuards(SessionAuthGuard)
@Controller("v1/data")
export class DataControlController {
  constructor(
    private readonly vaultExportService: VaultExportService,
    private readonly vaultImportService: VaultImportService
  ) {}

  @Get("export")
  @ApiOperation({ summary: "Export the current user's vault as JSON" })
  @ApiQuery({ name: "categoryKeys", required: false, isArray: true })
  @ApiQuery({ name: "sensitivity", required: false })
  @ApiQuery({ name: "createdAfter", required: false })
  @ApiQuery({ name: "createdBefore", required: false })
  @ApiQuery({ name: "includeAuditEvents", required: false })
  @ApiOkResponse({ type: VaultExportResponseDto })
  @ApiBadRequestResponse({ description: "Invalid export filters." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  export(
    @CurrentUser() user: AuthUser,
    @Query(
      new ZodValidationPipe(exportVaultQuerySchema, "Invalid export filters")
    )
    query: ExportVaultQuery
  ) {
    return this.vaultExportService.exportVault(user.id, query);
  }

  @Post("import/preview")
  @ApiOperation({ summary: "Validate and preview a vault import" })
  @ApiBody({ type: ImportVaultPreviewRequestDto })
  @ApiOkResponse({ type: ImportVaultPreviewResponseDto })
  @ApiBadRequestResponse({ description: "Invalid import file." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  previewImport(
    @CurrentUser() user: AuthUser,
    @Body(
      new ZodValidationPipe(
        importVaultPreviewRequestSchema,
        "Invalid import file"
      )
    )
    body: ImportVaultPreviewRequest
  ) {
    return this.vaultImportService.previewImport(user.id, body);
  }

  @Post("import")
  @ApiOperation({ summary: "Import a vault export as suggestions or memories" })
  @ApiBody({ type: ImportVaultRequestDto })
  @ApiCreatedResponse({ type: ImportVaultResponseDto })
  @ApiBadRequestResponse({ description: "Invalid import file." })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session." })
  import(
    @CurrentUser() user: AuthUser,
    @Body(
      new ZodValidationPipe(importVaultRequestSchema, "Invalid import file")
    )
    body: ImportVaultRequest
  ) {
    return this.vaultImportService.importVault(user.id, body);
  }
}
