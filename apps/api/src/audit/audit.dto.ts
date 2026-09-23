import {
  AuditActorType,
  AuditEventType,
  AuditSubjectRole,
  AuditSubjectType
} from "@funes-vault/db";
import { ApiProperty } from "@nestjs/swagger";

import { PaginationDto } from "../common/pagination.dto.js";

const auditEventTypes = Object.values(AuditEventType);

const auditActorTypes = Object.values(AuditActorType);

const auditSubjectTypes = Object.values(AuditSubjectType);

const auditSubjectRoles = Object.values(AuditSubjectRole);

export class AuditEventSubjectDto {
  @ApiProperty({ enum: auditSubjectTypes, example: "MEMORY" })
  type!: (typeof auditSubjectTypes)[number];

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ enum: auditSubjectRoles, example: "CREATED" })
  role!: (typeof auditSubjectRoles)[number];

  @ApiPropertyNullable({ example: "Prefers concise technical answers" })
  label!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  metadata!: Record<string, unknown>;
}

export class AuditEventDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ enum: auditEventTypes, example: "CLIENT_CREATED" })
  type!: (typeof auditEventTypes)[number];

  @ApiProperty({ enum: auditActorTypes, example: "USER" })
  actorType!: (typeof auditActorTypes)[number];

  @ApiPropertyNullable({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  actorId!: string | null;

  @ApiPropertyNullable({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  clientId!: string | null;

  @ApiPropertyNullable({ example: "Local Coding Agent" })
  clientName!: string | null;

  @ApiPropertyNullable({ example: null })
  memoryRequestId!: string | null;

  @ApiProperty({ type: "object", additionalProperties: true })
  metadata!: Record<string, unknown>;

  @ApiProperty({ type: [AuditEventSubjectDto] })
  subjects!: AuditEventSubjectDto[];

  @ApiProperty({ example: "2026-06-27T00:00:00.000Z" })
  createdAt!: string;
}

export class AuditEventResponseDto {
  @ApiProperty({ type: AuditEventDto })
  auditEvent!: AuditEventDto;
}

export class ListAuditEventsResponseDto {
  @ApiProperty({ type: [AuditEventDto] })
  items!: AuditEventDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

function ApiPropertyNullable(options: Parameters<typeof ApiProperty>[0]) {
  return ApiProperty({ ...options, nullable: true });
}
