import { ConsolidationMode, JobStatus, JobType } from "@funes-vault/db";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { PaginationDto } from "../common/pagination.dto.js";

const jobTypes = Object.values(JobType);

const jobStatuses = Object.values(JobStatus);

const consolidationModes = Object.values(ConsolidationMode);
const consolidationReasons = [
  "expired",
  "exact_duplicate",
  "semantic_duplicate",
  "conflict",
  "superseded"
] as const;

class ConsolidationActionSummaryDto {
  @ApiProperty({ example: "archive_memory" })
  action!: "archive_memory";

  @ApiProperty({ enum: consolidationReasons, example: "exact_duplicate" })
  reason!: (typeof consolidationReasons)[number];

  @ApiProperty({ example: "Exact duplicate of memory cmqvt0..." })
  evidence!: string;

  @ApiProperty({ example: 0.95, minimum: 0, maximum: 1 })
  confidence!: number;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  targetMemoryId!: string;

  @ApiProperty({ example: "Prefers concise implementation help" })
  targetLabel!: string;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u4", nullable: true })
  canonicalMemoryId!: string | null;

  @ApiProperty({
    example: "Prefers concise implementation help",
    nullable: true
  })
  canonicalLabel!: string | null;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u5", nullable: true })
  suggestionId!: string | null;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u6", nullable: true })
  auditEventId!: string | null;

  @ApiProperty({ example: false })
  applied!: boolean;

  @ApiProperty({ enum: consolidationModes, example: "REVIEW_ONLY" })
  mode!: (typeof consolidationModes)[number];
}

class JobConsolidationDto {
  @ApiProperty({ example: "manual" })
  trigger!: string;

  @ApiProperty({ enum: consolidationModes, example: "REVIEW_ONLY" })
  mode!: (typeof consolidationModes)[number];

  @ApiProperty({ example: 12 })
  inspectedMemoryCount!: number;

  @ApiProperty({ example: 8 })
  recentMemoryCount!: number;

  @ApiProperty({ example: 2 })
  expiredMemoryCount!: number;

  @ApiProperty({ example: 3 })
  candidateCount!: number;

  @ApiProperty({ example: 2 })
  suggestionsCreated!: number;

  @ApiProperty({ example: 0 })
  actionsAutoApplied!: number;

  @ApiProperty({ example: 9 })
  noActionPairs!: number;

  @ApiProperty({ type: [ConsolidationActionSummaryDto] })
  actions!: ConsolidationActionSummaryDto[];
}

export class JobRunDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ enum: jobTypes, example: "CONSOLIDATE_MEMORIES" })
  type!: (typeof jobTypes)[number];

  @ApiProperty({ enum: jobStatuses, example: "QUEUED" })
  status!: (typeof jobStatuses)[number];

  @ApiProperty({ example: 0 })
  attempts!: number;

  @ApiProperty({ example: 3 })
  maxAttempts!: number;

  @ApiProperty({ type: "object", additionalProperties: true })
  metadata!: Record<string, unknown>;

  @ApiProperty({ type: JobConsolidationDto, nullable: true })
  consolidation!: JobConsolidationDto | null;

  @ApiProperty({ example: null, nullable: true })
  error!: string | null;

  @ApiProperty({ example: null, nullable: true })
  startedAt!: string | null;

  @ApiProperty({ example: null, nullable: true })
  finishedAt!: string | null;

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  updatedAt!: string;
}

export class JobRunResponseDto {
  @ApiProperty({ type: JobRunDto })
  job!: JobRunDto;
}

export class ListJobsResponseDto {
  @ApiProperty({ type: [JobRunDto] })
  items!: JobRunDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class ConsolidationSettingsDto {
  @ApiProperty({ example: false })
  enabled!: boolean;

  @ApiProperty({ enum: consolidationModes, example: "REVIEW_ONLY" })
  mode!: (typeof consolidationModes)[number];
}

export class UpdateConsolidationSettingsDto {
  @ApiPropertyOptional({ example: true })
  enabled?: boolean;

  @ApiPropertyOptional({ enum: consolidationModes, example: "AUTO_APPLY" })
  mode?: (typeof consolidationModes)[number];
}

export class ConsolidationSettingsResponseDto {
  @ApiProperty({ type: ConsolidationSettingsDto })
  settings!: ConsolidationSettingsDto;
}
