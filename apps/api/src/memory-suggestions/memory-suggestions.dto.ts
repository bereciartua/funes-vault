import {
  MemoryKind,
  MemorySensitivity,
  MemoryStatus,
  ProvenanceSubjectRole,
  ProvenanceSubjectType,
  SourceType
} from "@funes-vault/db";
import { memoryRequestReasonSchema } from "@funes-vault/shared";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { PaginationDto } from "../common/pagination.dto.js";

const memoryKinds = Object.values(MemoryKind);

const memorySensitivities = Object.values(MemorySensitivity);

const memorySuggestionStatuses = [
  "QUEUED_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
  "APPLIED",
  "DISMISSED",
  "DENIED"
] as const;

const policyDecisions = ["ALLOW", "NEEDS_CONFIRMATION", "DENY"] as const;
const sourceTypes = Object.values(SourceType);

const memoryStatuses = Object.values(MemoryStatus);

const provenanceSubjectTypes = Object.values(ProvenanceSubjectType);

const provenanceSubjectRoles = Object.values(ProvenanceSubjectRole);

class ProvenanceSubjectDto {
  @ApiProperty({ enum: provenanceSubjectTypes, example: "MEMORY" })
  type!: (typeof provenanceSubjectTypes)[number];

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ enum: provenanceSubjectRoles, example: "TARGET" })
  role!: (typeof provenanceSubjectRoles)[number];

  @ApiProperty({ example: "Prefers focused coding help", nullable: true })
  label!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  metadata!: Record<string, unknown>;

  @ApiProperty({ enum: memoryStatuses, example: "ACTIVE", nullable: true })
  memoryStatus!: (typeof memoryStatuses)[number] | null;

  @ApiProperty({
    enum: memorySensitivities,
    example: "LOW",
    nullable: true
  })
  memorySensitivity!: (typeof memorySensitivities)[number] | null;
}

export class CreateMemorySuggestionDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 160,
    description:
      "Caller-declared audit reason; does not affect permissions or retrieval."
  })
  purpose?: string | null;

  @ApiProperty({ enum: memoryKinds, example: "PREFERENCE" })
  kind!: (typeof memoryKinds)[number];

  @ApiProperty({ example: "Prefers local-first tools" })
  title!: string;

  @ApiProperty({
    example:
      "The user prefers local-first tools for privacy-sensitive workflows."
  })
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["privacy_preferences"]
  })
  categoryKeys?: string[];

  @ApiPropertyOptional({ enum: memorySensitivities, example: "LOW" })
  sensitivity?: (typeof memorySensitivities)[number];

  @ApiPropertyOptional({
    example: "Observed in the active coding session.",
    nullable: true
  })
  evidence?: string | null;

  @ApiPropertyOptional({ example: 0.8, minimum: 0, maximum: 1 })
  confidence?: number;

  @ApiPropertyOptional({
    example: "2026-07-11T23:59:59.000Z",
    nullable: true
  })
  expiresAt?: string | null;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  sourceMetadata?: Record<string, unknown>;
}

class DeniedSuggestionDto {
  @ApiProperty({ example: "proposed_memory" })
  memoryId!: string;

  @ApiProperty({ example: "category_not_allowed" })
  reason!: string;
}

export class MemorySuggestionResponseDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3", nullable: true })
  suggestionId!: string | null;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3", nullable: true })
  memoryId!: string | null;

  @ApiProperty({ enum: memorySuggestionStatuses, example: "QUEUED_FOR_REVIEW" })
  status!: (typeof memorySuggestionStatuses)[number];

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3", nullable: true })
  policyId!: string | null;

  @ApiProperty({ enum: memoryRequestReasonSchema.options, nullable: true })
  reason!: string | null;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3", nullable: true })
  auditEventId!: string | null;

  @ApiProperty({ enum: policyDecisions, example: "ALLOW" })
  decision!: (typeof policyDecisions)[number];

  @ApiProperty({ type: [DeniedSuggestionDto] })
  denied!: DeniedSuggestionDto[];
}

class ReviewableMemorySuggestionSourceDto {
  @ApiProperty({ enum: sourceTypes, example: "CHAT" })
  type!: (typeof sourceTypes)[number];

  @ApiProperty({ example: null, nullable: true })
  clientId!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  metadata!: Record<string, unknown>;

  @ApiProperty({ type: [ProvenanceSubjectDto] })
  subjects!: ProvenanceSubjectDto[];
}

class ReviewableMemorySuggestionDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ example: "Prefers focused coding help" })
  title!: string;

  @ApiProperty({
    example: "The user prefers focused coding help with concrete file changes."
  })
  body!: string;

  @ApiProperty({ enum: memoryKinds, example: "PREFERENCE" })
  kind!: (typeof memoryKinds)[number];

  @ApiProperty({ enum: memorySensitivities, example: "LOW" })
  sensitivity!: (typeof memorySensitivities)[number];

  @ApiProperty({ type: [String], example: ["software_development"] })
  categoryKeys!: string[];

  @ApiProperty({ example: "Guided onboarding answer.", nullable: true })
  evidence!: string | null;

  @ApiProperty({ example: 0.68, minimum: 0, maximum: 1 })
  confidence!: number;

  @ApiProperty({ example: "2026-07-11T23:59:59.000Z", nullable: true })
  expiresAt!: string | null;

  @ApiProperty({
    enum: memorySuggestionStatuses.filter((status) => status !== "DENIED"),
    example: "QUEUED_FOR_REVIEW"
  })
  status!: Exclude<(typeof memorySuggestionStatuses)[number], "DENIED">;

  @ApiProperty({ type: ReviewableMemorySuggestionSourceDto })
  source!: ReviewableMemorySuggestionSourceDto;

  @ApiProperty({ example: "2026-06-27T12:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-06-27T12:00:00.000Z" })
  updatedAt!: string;
}

export class ListMemorySuggestionsResponseDto {
  @ApiProperty({ type: [ReviewableMemorySuggestionDto] })
  items!: ReviewableMemorySuggestionDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

class CreatedMemoryFromSuggestionDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ example: "Prefers focused coding help" })
  title!: string;
}

export class MemorySuggestionReviewResponseDto {
  @ApiProperty({ type: ReviewableMemorySuggestionDto })
  suggestion!: ReviewableMemorySuggestionDto;

  @ApiPropertyOptional({ type: CreatedMemoryFromSuggestionDto })
  memory?: CreatedMemoryFromSuggestionDto;
}

export class BulkReviewMemorySuggestionsRequestDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 100,
    example: ["cmqvt0v580000xeg7jgy7v1u3"]
  })
  ids!: string[];

  @ApiProperty({ enum: ["apply", "reject"], example: "apply" })
  action!: "apply" | "reject";
}

class BulkReviewMemorySuggestionResultDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ enum: ["applied", "rejected", "failed"], example: "applied" })
  status!: "applied" | "rejected" | "failed";

  @ApiPropertyOptional({ type: ReviewableMemorySuggestionDto })
  suggestion?: ReviewableMemorySuggestionDto;

  @ApiPropertyOptional({ type: CreatedMemoryFromSuggestionDto })
  memory?: CreatedMemoryFromSuggestionDto;

  @ApiPropertyOptional({ example: "Memory suggestion is not reviewable" })
  error?: string;
}

export class BulkReviewMemorySuggestionsResponseDto {
  @ApiProperty({ enum: ["apply", "reject"], example: "apply" })
  action!: "apply" | "reject";

  @ApiProperty({ example: 12 })
  requested!: number;

  @ApiProperty({ example: 11 })
  succeeded!: number;

  @ApiProperty({ example: 1 })
  failed!: number;

  @ApiProperty({ type: [BulkReviewMemorySuggestionResultDto] })
  results!: BulkReviewMemorySuggestionResultDto[];
}
