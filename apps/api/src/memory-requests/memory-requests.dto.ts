import {
  ClientRetention,
  MemoryRequestStatus,
  MemorySensitivity
} from "@funes-vault/db";
import { memoryRequestReasonSchema } from "@funes-vault/shared";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const memoryRequestStatuses = Object.values(MemoryRequestStatus);

const memorySensitivities = Object.values(MemorySensitivity);

const clientRetentions = Object.values(ClientRetention);

export class CreateMemoryBundleRequestDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 160,
    description:
      "Caller-declared audit reason; does not affect permissions or retrieval."
  })
  purpose?: string | null;

  @ApiProperty({ example: "Help the user modify a local repository" })
  task!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["communication_style", "software_development"]
  })
  requestedCategories?: string[];

  @ApiPropertyOptional({ enum: clientRetentions, example: "NO_STORAGE" })
  retention?: (typeof clientRetentions)[number];

  @ApiPropertyOptional({ type: [String], example: [] })
  thirdPartyProcessors?: string[];

  @ApiPropertyOptional({ example: 1200, minimum: 100, maximum: 8000 })
  tokenBudget?: number;
}

class MemoryBundleItemDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  memoryId!: string;

  @ApiProperty({
    example:
      "Prefers concise technical answers: The user prefers concise answers."
  })
  text!: string;

  @ApiProperty({ example: "communication_style", nullable: true })
  category!: string | null;

  @ApiProperty({ enum: memorySensitivities, example: "LOW" })
  sensitivity!: (typeof memorySensitivities)[number];

  @ApiPropertyOptional({ example: 0.842 })
  relevanceScore?: number;

  @ApiProperty({ example: 24 })
  estimatedTokens!: number;
}

class DeniedMemoryDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  memoryId!: string;

  @ApiProperty({ example: "above_sensitivity_ceiling" })
  reason!: string;
}

export class MemoryBundleResponseDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  requestId!: string;

  @ApiProperty({ enum: memoryRequestStatuses, example: "FULFILLED" })
  status!: (typeof memoryRequestStatuses)[number];

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3", nullable: true })
  policyId!: string | null;

  @ApiProperty({ enum: memoryRequestReasonSchema.options, nullable: true })
  reason!: string | null;

  @ApiProperty({ example: 1200 })
  tokenBudget!: number;

  @ApiProperty({ example: 96 })
  estimatedTokens!: number;

  @ApiProperty({ type: [MemoryBundleItemDto] })
  items!: MemoryBundleItemDto[];

  @ApiProperty({ type: [String] })
  instructions!: string[];

  @ApiProperty({ type: [DeniedMemoryDto] })
  denied!: DeniedMemoryDto[];

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3", nullable: true })
  auditEventId!: string | null;
}

class DisclosureSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() clientName!: string;
  @ApiProperty({ type: String, nullable: true }) statedPurpose!: string | null;
  @ApiProperty({ type: String, nullable: true }) policyId!: string | null;
  @ApiProperty({ type: String, nullable: true }) policyVersion!: string | null;
  @ApiProperty({ enum: memoryRequestReasonSchema.options, nullable: true })
  reason!: string | null;

  @ApiProperty() task!: string;
  @ApiProperty({ enum: memoryRequestStatuses }) status!: string;
  @ApiProperty({ enum: clientRetentions }) retention!: string;
  @ApiProperty({ type: [String] }) thirdPartyProcessors!: string[];
  @ApiProperty() createdAt!: string;
}
export class DisclosureReviewListDto {
  @ApiProperty({ type: [DisclosureSummaryDto] }) items!: DisclosureSummaryDto[];
  @ApiProperty({ type: Object }) pagination!: object;
}
export class DisclosurePreviewDto {
  @ApiProperty({ type: DisclosureSummaryDto }) request!: DisclosureSummaryDto;
  @ApiProperty() revision!: string;
  @ApiProperty({ type: [MemoryBundleItemDto] }) items!: MemoryBundleItemDto[];
  @ApiProperty() canApprove!: boolean;
}
export class ReviewDisclosureDto {
  @ApiProperty({ enum: ["approve", "deny"] }) action!: string;
  @ApiPropertyOptional({
    description: "Required for approval; use the preview revision."
  })
  revision?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      "Required for approval; select one or more previewed memory IDs."
  })
  memoryIds?: string[];
}
