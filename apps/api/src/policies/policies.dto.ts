import { MemorySensitivity, PolicyOperation } from "@funes-vault/db";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { PaginationDto } from "../common/pagination.dto.js";

const memorySensitivities = Object.values(MemorySensitivity);

const policyOperations = Object.values(PolicyOperation);

export class PolicyDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  clientId!: string;

  @ApiPropertyNullable({ example: "Local Coding Agent" })
  clientName!: string | null;

  @ApiProperty({
    type: [String],
    example: ["communication_style", "software_development"]
  })
  allowedCategoryKeys!: string[];

  @ApiProperty({ type: [String], example: ["health", "finance"] })
  deniedCategoryKeys!: string[];

  @ApiProperty({ enum: memorySensitivities, example: "INTERNAL" })
  maxSensitivity!: (typeof memorySensitivities)[number];

  @ApiProperty({
    enum: policyOperations,
    isArray: true,
    example: ["READ"]
  })
  operations!: Array<(typeof policyOperations)[number]>;

  @ApiProperty({ example: true })
  requiresConfirmation!: boolean;

  @ApiPropertyNullable({ example: null })
  expiresAt!: string | null;

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  updatedAt!: string;
}

export class CreatePolicyRequestDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  clientId!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["communication_style", "software_development"]
  })
  allowedCategoryKeys?: string[];

  @ApiPropertyOptional({ type: [String], example: ["health", "finance"] })
  deniedCategoryKeys?: string[];

  @ApiPropertyOptional({ enum: memorySensitivities, example: "INTERNAL" })
  maxSensitivity?: (typeof memorySensitivities)[number];

  @ApiPropertyOptional({
    enum: policyOperations,
    isArray: true,
    example: ["READ", "SUGGEST", "WRITE"]
  })
  operations?: Array<(typeof policyOperations)[number]>;

  @ApiPropertyOptional({ example: true })
  requiresConfirmation?: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  expiresAt?: string | null;
}

export class UpdatePolicyRequestDto {
  @ApiPropertyOptional({
    type: [String],
    example: ["communication_style", "software_development"]
  })
  allowedCategoryKeys?: string[];

  @ApiPropertyOptional({ type: [String], example: ["health", "finance"] })
  deniedCategoryKeys?: string[];

  @ApiPropertyOptional({ enum: memorySensitivities, example: "INTERNAL" })
  maxSensitivity?: (typeof memorySensitivities)[number];

  @ApiPropertyOptional({
    enum: policyOperations,
    isArray: true,
    example: ["READ"]
  })
  operations?: Array<(typeof policyOperations)[number]>;

  @ApiPropertyOptional({ example: false })
  requiresConfirmation?: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  expiresAt?: string | null;
}

export class PolicyResponseDto {
  @ApiProperty({ type: PolicyDto })
  policy!: PolicyDto;
}

export class ListPoliciesResponseDto {
  @ApiProperty({ type: [PolicyDto] })
  items!: PolicyDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

function ApiPropertyNullable(options: Parameters<typeof ApiProperty>[0]) {
  return ApiProperty({ ...options, nullable: true });
}
