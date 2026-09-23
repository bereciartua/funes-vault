import {
  AuditActorType,
  MemoryKind,
  MemoryProvenanceEntryType,
  MemorySensitivity,
  MemoryStatus,
  ProvenanceSubjectRole,
  ProvenanceSubjectType,
  ReviewState,
  SourceType
} from "@funes-vault/db";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { PaginationDto } from "../common/pagination.dto.js";

const memoryKinds = Object.values(MemoryKind);

const memorySensitivities = Object.values(MemorySensitivity);

const memoryStatuses = Object.values(MemoryStatus);

const reviewStates = Object.values(ReviewState);

const sourceTypes = Object.values(SourceType);

const auditActorTypes = Object.values(AuditActorType);

const provenanceEntryTypes = Object.values(MemoryProvenanceEntryType);

const provenanceSubjectTypes = Object.values(ProvenanceSubjectType);

const provenanceSubjectRoles = Object.values(ProvenanceSubjectRole);

export class MemoryCategoryDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ example: "software_development" })
  key!: string;

  @ApiProperty({ example: "Software Development" })
  name!: string;

  @ApiPropertyNullable({
    example: "Coding tools, languages, workflows, and preferences."
  })
  description!: string | null;
}

export class MemorySourceDto {
  @ApiProperty({ enum: sourceTypes, example: "MANUAL" })
  type!: (typeof sourceTypes)[number];

  @ApiPropertyNullable({ example: null })
  clientId!: string | null;

  @ApiPropertyNullable({ example: null })
  uri!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  metadata!: Record<string, unknown>;
}

export class MemoryDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ enum: memoryKinds, example: "PREFERENCE" })
  kind!: (typeof memoryKinds)[number];

  @ApiProperty({ example: "Prefers concise technical answers" })
  title!: string;

  @ApiProperty({
    example: "The user prefers concise, direct technical answers."
  })
  body!: string;

  @ApiProperty({ type: [MemoryCategoryDto] })
  categories!: MemoryCategoryDto[];

  @ApiProperty({ type: [String], example: ["communication_style"] })
  categoryKeys!: string[];

  @ApiProperty({ enum: memorySensitivities, example: "LOW" })
  sensitivity!: (typeof memorySensitivities)[number];

  @ApiProperty({ example: 0.86, minimum: 0, maximum: 1 })
  confidence!: number;

  @ApiProperty({ enum: memoryStatuses, example: "ACTIVE" })
  status!: (typeof memoryStatuses)[number];

  @ApiProperty({ enum: reviewStates, example: "APPROVED" })
  reviewState!: (typeof reviewStates)[number];

  @ApiProperty({ type: MemorySourceDto })
  source!: MemorySourceDto;

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  updatedAt!: string;

  @ApiPropertyNullable({ example: null })
  expiresAt!: string | null;

  @ApiPropertyNullable({ example: null })
  lastConfirmedAt!: string | null;
}

export class CreateMemoryRequestDto {
  @ApiProperty({ enum: memoryKinds, example: "PREFERENCE" })
  kind!: (typeof memoryKinds)[number];

  @ApiProperty({ example: "Prefers concise technical answers" })
  title!: string;

  @ApiProperty({
    example: "The user prefers concise, direct technical answers."
  })
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["communication_style", "software_development"]
  })
  categoryKeys?: string[];

  @ApiPropertyOptional({ enum: memorySensitivities, example: "LOW" })
  sensitivity?: (typeof memorySensitivities)[number];

  @ApiPropertyOptional({ example: 1, minimum: 0, maximum: 1 })
  confidence?: number;

  @ApiPropertyOptional({ enum: memoryStatuses, example: "ACTIVE" })
  status?: (typeof memoryStatuses)[number];

  @ApiPropertyOptional({ enum: reviewStates, example: "APPROVED" })
  reviewState?: (typeof reviewStates)[number];

  @ApiPropertyOptional({ example: null, nullable: true })
  expiresAt?: string | null;

  @ApiPropertyOptional({ enum: sourceTypes, example: "MANUAL" })
  sourceType?: (typeof sourceTypes)[number];

  @ApiPropertyOptional({ example: null, nullable: true })
  sourceUri?: string | null;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  sourceMetadata?: Record<string, unknown>;
}

export class UpdateMemoryRequestDto {
  @ApiPropertyOptional({ enum: memoryKinds, example: "PREFERENCE" })
  kind?: (typeof memoryKinds)[number];

  @ApiPropertyOptional({ example: "Prefers concise implementation help" })
  title?: string;

  @ApiPropertyOptional({
    example: "The user prefers concise implementation when intent is clear."
  })
  body?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["communication_style", "software_development"]
  })
  categoryKeys?: string[];

  @ApiPropertyOptional({ enum: memorySensitivities, example: "INTERNAL" })
  sensitivity?: (typeof memorySensitivities)[number];

  @ApiPropertyOptional({ example: 0.9, minimum: 0, maximum: 1 })
  confidence?: number;

  @ApiPropertyOptional({ enum: memoryStatuses, example: "ARCHIVED" })
  status?: (typeof memoryStatuses)[number];

  @ApiPropertyOptional({ enum: reviewStates, example: "APPROVED" })
  reviewState?: (typeof reviewStates)[number];

  @ApiPropertyOptional({ example: null, nullable: true })
  expiresAt?: string | null;

  @ApiPropertyOptional({ enum: sourceTypes, example: "MANUAL" })
  sourceType?: (typeof sourceTypes)[number];

  @ApiPropertyOptional({ example: null, nullable: true })
  sourceUri?: string | null;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  sourceMetadata?: Record<string, unknown>;
}

export class MemoryResponseDto {
  @ApiProperty({ type: MemoryDto })
  memory!: MemoryDto;
}

export class ProvenanceSubjectDto {
  @ApiProperty({ enum: provenanceSubjectTypes, example: "MEMORY" })
  type!: (typeof provenanceSubjectTypes)[number];

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ enum: provenanceSubjectRoles, example: "TARGET" })
  role!: (typeof provenanceSubjectRoles)[number];

  @ApiPropertyNullable({ example: "Prefers concise technical answers" })
  label!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  metadata!: Record<string, unknown>;

  @ApiPropertyNullable({ enum: memoryStatuses, example: "ACTIVE" })
  memoryStatus!: (typeof memoryStatuses)[number] | null;

  @ApiPropertyNullable({ enum: memorySensitivities, example: "LOW" })
  memorySensitivity!: (typeof memorySensitivities)[number] | null;
}

export class MemoryProvenanceEntryDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ enum: provenanceEntryTypes, example: "CREATED" })
  type!: (typeof provenanceEntryTypes)[number];

  @ApiProperty({ enum: auditActorTypes, example: "USER" })
  actorType!: (typeof auditActorTypes)[number];

  @ApiPropertyNullable({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  actorId!: string | null;

  @ApiPropertyNullable({ enum: sourceTypes, example: "MANUAL" })
  sourceType!: (typeof sourceTypes)[number] | null;

  @ApiPropertyNullable({ example: null })
  sourceClientId!: string | null;

  @ApiPropertyNullable({ example: null })
  sourceUri!: string | null;

  @ApiPropertyNullable({ example: null })
  suggestionId!: string | null;

  @ApiPropertyNullable({ example: null })
  jobRunId!: string | null;

  @ApiPropertyNullable({ example: null })
  auditEventId!: string | null;

  @ApiPropertyNullable({ example: null })
  memoryRequestId!: string | null;

  @ApiPropertyNullable({ example: "manual" })
  reason!: string | null;

  @ApiPropertyNullable({ example: null })
  evidence!: string | null;

  @ApiPropertyNullable({ example: 0.92 })
  confidence!: number | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  metadata!: Record<string, unknown>;

  @ApiProperty({ type: [ProvenanceSubjectDto] })
  subjects!: ProvenanceSubjectDto[];

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  createdAt!: string;
}

export class MemoryProvenanceResponseDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  memoryId!: string;

  @ApiProperty({ type: [MemoryProvenanceEntryDto] })
  entries!: MemoryProvenanceEntryDto[];
}

export class ListMemoriesResponseDto {
  @ApiProperty({ type: [MemoryDto] })
  items!: MemoryDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class ListCategoriesResponseDto {
  @ApiProperty({ type: [MemoryCategoryDto] })
  items!: MemoryCategoryDto[];
}

function ApiPropertyNullable(options: Parameters<typeof ApiProperty>[0]) {
  return ApiProperty({ ...options, nullable: true });
}
