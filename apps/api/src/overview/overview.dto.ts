import { ClientTrustLevel, MemorySensitivity } from "@funes-vault/db";
import { ApiProperty } from "@nestjs/swagger";

import { AuditEventDto } from "../audit/audit.dto.js";
import { MemoryDto } from "../memories/memories.dto.js";
import { PolicyDto } from "../policies/policies.dto.js";

const memorySensitivities = Object.values(MemorySensitivity);
const trustLevels = Object.values(ClientTrustLevel);

class MemorySensitivityCountDto {
  @ApiProperty({ enum: memorySensitivities, example: "LOW" })
  sensitivity!: (typeof memorySensitivities)[number];

  @ApiProperty({ example: 42 })
  count!: number;
}

class ClientTrustCountDto {
  @ApiProperty({ enum: trustLevels, example: "APPROVED" })
  trustLevel!: (typeof trustLevels)[number];

  @ApiProperty({ example: 3 })
  count!: number;
}

class CaptureSeriesPointDto {
  @ApiProperty({ example: "2026-07-08" })
  date!: string;

  @ApiProperty({ example: 7, minimum: 0 })
  count!: number;
}

class OverviewPolicyDto extends PolicyDto {
  @ApiProperty()
  firstParty!: boolean;
}

export class OverviewResponseDto {
  @ApiProperty({ example: 128 })
  memoryTotal!: number;

  @ApiProperty({ type: [MemorySensitivityCountDto] })
  memorySensitivityCounts!: MemorySensitivityCountDto[];

  @ApiPropertyNullable({ type: MemoryDto })
  recentHighSensitivityMemory!: MemoryDto | null;

  @ApiProperty({ example: 6 })
  clientTotal!: number;

  @ApiProperty({ type: [ClientTrustCountDto] })
  clientTrustCounts!: ClientTrustCountDto[];

  @ApiProperty({ example: 8 })
  policyTotal!: number;

  @ApiProperty({ example: 12 })
  categoryTotal!: number;

  @ApiPropertyNullable({ type: OverviewPolicyDto })
  broadestPolicy!: OverviewPolicyDto | null;

  @ApiProperty({ example: 4 })
  suggestionTotal!: number;

  @ApiPropertyNullable({
    example: "2026-07-01T10:30:00.000Z",
    format: "date-time",
    type: String
  })
  oldestPendingSuggestionAt!: string | null;

  @ApiProperty({ type: [CaptureSeriesPointDto] })
  captureSeries!: CaptureSeriesPointDto[];

  @ApiPropertyNullable({
    example: "2026-07-08T14:12:00.000Z",
    format: "date-time",
    type: String
  })
  lastCapturedAt!: string | null;

  @ApiProperty({ example: 42 })
  auditTotal!: number;

  @ApiProperty({ type: [AuditEventDto] })
  recentAuditEvents!: AuditEventDto[];
}

function ApiPropertyNullable(options: Parameters<typeof ApiProperty>[0]) {
  return ApiProperty({ ...options, nullable: true });
}
