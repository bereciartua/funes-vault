import {
  ClientRetention,
  ClientTrustLevel,
  ClientType,
  MemorySensitivity
} from "@funes-vault/db";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { PaginationDto } from "../common/pagination.dto.js";

const clientTypes = Object.values(ClientType);

const trustLevels = Object.values(ClientTrustLevel);
const retentionLevels = Object.values(ClientRetention);

export class ClientPolicySummaryDto {
  @ApiProperty({ enum: Object.values(MemorySensitivity) })
  maxSensitivity!: MemorySensitivity;

  @ApiProperty({ type: [String] })
  allowedCategoryKeys!: string[];

  @ApiProperty()
  requiresConfirmation!: boolean;
}

export class ClientDto {
  @ApiPropertyOptional({
    type: ClientPolicySummaryDto,
    nullable: true,
    description:
      "Most recently updated unexpired policy, included in client lists."
  })
  policySummary?: ClientPolicySummaryDto | null;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ example: "Local Coding Agent" })
  name!: string;

  @ApiProperty({ enum: clientTypes, example: "MCP_CLIENT" })
  type!: (typeof clientTypes)[number];

  @ApiProperty({ enum: trustLevels, example: "APPROVED" })
  trustLevel!: (typeof trustLevels)[number];

  @ApiProperty({ enum: retentionLevels, example: "NO_STORAGE" })
  declaredRetention!: (typeof retentionLevels)[number];

  @ApiProperty({ example: true })
  hasToken!: boolean;

  @ApiProperty({ example: 1 })
  policyCount!: number;

  @ApiProperty({
    example: false,
    description: "True when this client is an OAuth connector grant."
  })
  oauthConnector!: boolean;

  @ApiPropertyNullable({ example: null })
  lastUsedAt!: string | null;

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  updatedAt!: string;
}

export class CreateClientRequestDto {
  @ApiProperty({ example: "Local Coding Agent" })
  name!: string;

  @ApiPropertyOptional({ enum: clientTypes, example: "MCP_CLIENT" })
  type?: (typeof clientTypes)[number];

  @ApiPropertyOptional({ enum: trustLevels, example: "UNKNOWN" })
  trustLevel?: (typeof trustLevels)[number];

  @ApiPropertyOptional({ enum: retentionLevels, example: "NO_STORAGE" })
  declaredRetention?: (typeof retentionLevels)[number];
}

export class UpdateClientRequestDto {
  @ApiPropertyOptional({ example: "Local Coding Agent" })
  name?: string;

  @ApiPropertyOptional({ enum: clientTypes, example: "MCP_CLIENT" })
  type?: (typeof clientTypes)[number];

  @ApiPropertyOptional({ enum: trustLevels, example: "APPROVED" })
  trustLevel?: (typeof trustLevels)[number];

  @ApiPropertyOptional({ enum: retentionLevels, example: "NO_STORAGE" })
  declaredRetention?: (typeof retentionLevels)[number];

  @ApiPropertyOptional({ example: false })
  rotateToken?: boolean;
}

export class ClientResponseDto {
  @ApiProperty({ type: ClientDto })
  client!: ClientDto;

  @ApiPropertyOptional({
    example: "fvlt_lIoA4pnbbq5STGNOqkX0XhFrxyl1wP1mzv43v6I89BA"
  })
  token?: string;
}

export class ClientOptionDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ example: "Local Coding Agent" })
  name!: string;

  @ApiProperty({ enum: clientTypes, example: "MCP_CLIENT" })
  type!: (typeof clientTypes)[number];

  @ApiProperty({ enum: trustLevels, example: "APPROVED" })
  trustLevel!: (typeof trustLevels)[number];
}

export class ListClientsResponseDto {
  @ApiProperty({ type: [ClientDto] })
  items!: ClientDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class ListClientOptionsResponseDto {
  @ApiProperty({ type: [ClientOptionDto] })
  items!: ClientOptionDto[];
}

function ApiPropertyNullable(options: Parameters<typeof ApiProperty>[0]) {
  return ApiProperty({ ...options, nullable: true });
}
