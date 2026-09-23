import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { AuditEventDto } from "../audit/audit.dto.js";
import { ClientDto } from "../clients/clients.dto.js";
import { MemoryCategoryDto, MemoryDto } from "../memories/memories.dto.js";
import { PolicyDto } from "../policies/policies.dto.js";

const importModes = ["SUGGESTIONS", "ACTIVE_MEMORIES"] as const;

class VaultExportSourceDto {
  @ApiProperty({ example: "funes-vault" })
  app!: "funes-vault";

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  userId!: string;

  @ApiProperty({ example: "demo@funes-vault.local", nullable: true })
  email!: string | null;

  @ApiProperty({ example: "Demo User", nullable: true })
  displayName!: string | null;
}

class VaultExportFiltersDto {
  @ApiProperty({ type: [String], example: ["software_development"] })
  categoryKeys!: string[];

  @ApiProperty({ example: "LOW", nullable: true })
  sensitivity!: string | null;

  @ApiProperty({ example: null, nullable: true })
  createdAfter!: string | null;

  @ApiProperty({ example: null, nullable: true })
  createdBefore!: string | null;

  @ApiProperty({ example: false })
  includeAuditEvents!: boolean;
}

class VaultExportMetadataDto {
  @ApiProperty({ example: "funes-vault.export.v1" })
  schemaVersion!: "funes-vault.export.v1";

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  exportedAt!: string;

  @ApiProperty({ type: VaultExportSourceDto })
  source!: VaultExportSourceDto;

  @ApiProperty({ type: VaultExportFiltersDto })
  filters!: VaultExportFiltersDto;
}

class VaultExportDto {
  @ApiProperty({ type: VaultExportMetadataDto })
  metadata!: VaultExportMetadataDto;

  @ApiProperty({ type: [MemoryCategoryDto] })
  categories!: MemoryCategoryDto[];

  @ApiProperty({ type: [MemoryDto] })
  memories!: MemoryDto[];

  @ApiProperty({ type: [ClientDto] })
  clients!: ClientDto[];

  @ApiProperty({ type: [PolicyDto] })
  policies!: PolicyDto[];

  @ApiPropertyOptional({ type: [AuditEventDto] })
  auditEvents?: AuditEventDto[];
}

export class VaultExportResponseDto {
  @ApiProperty({ type: VaultExportDto })
  export!: VaultExportDto;
}

export class ImportVaultPreviewRequestDto {
  @ApiProperty({ type: VaultExportDto })
  export!: VaultExportDto;
}

export class ImportVaultRequestDto {
  @ApiProperty({ type: VaultExportDto })
  export!: VaultExportDto;

  @ApiPropertyOptional({ enum: importModes, example: "SUGGESTIONS" })
  mode?: (typeof importModes)[number];
}

class PossibleDuplicateMemoryDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  importedId!: string;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u4" })
  existingId!: string;

  @ApiProperty({ example: "Prefers concise technical answers" })
  title!: string;
}

class ImportVaultPreviewDto {
  @ApiProperty({ example: "funes-vault.export.v1" })
  schemaVersion!: "funes-vault.export.v1";

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  exportedAt!: string;

  @ApiProperty({ example: 12 })
  memories!: number;

  @ApiProperty({ example: 8 })
  categories!: number;

  @ApiProperty({ example: 2 })
  clients!: number;

  @ApiProperty({ example: 3 })
  policies!: number;

  @ApiProperty({ example: 4 })
  auditEvents!: number;

  @ApiProperty({ type: [PossibleDuplicateMemoryDto] })
  possibleDuplicateMemories!: PossibleDuplicateMemoryDto[];

  @ApiProperty({ type: [String], example: ["software_development"] })
  categoryKeys!: string[];
}

export class ImportVaultPreviewResponseDto {
  @ApiProperty({ type: ImportVaultPreviewDto })
  preview!: ImportVaultPreviewDto;
}

class ImportVaultSummaryDto {
  @ApiProperty({ enum: importModes, example: "SUGGESTIONS" })
  mode!: (typeof importModes)[number];

  @ApiProperty({ example: 0 })
  memoriesCreated!: number;

  @ApiProperty({ example: 12 })
  suggestionsCreated!: number;

  @ApiProperty({ example: 2 })
  clientsCreated!: number;

  @ApiProperty({ example: 3 })
  policiesCreated!: number;

  @ApiProperty({ example: 8 })
  categoriesUpserted!: number;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  jobRunId!: string;
}

export class ImportVaultResponseDto {
  @ApiProperty({ type: ImportVaultSummaryDto })
  imported!: ImportVaultSummaryDto;
}
