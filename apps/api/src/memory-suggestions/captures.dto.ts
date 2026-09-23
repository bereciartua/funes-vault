import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const captureStatuses = [
  "QUEUED_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
  "APPLIED",
  "DISMISSED",
  "DENIED"
] as const;

export class CreateCaptureDto {
  @ApiProperty({
    example: "Remember to ask the dentist about the retainer next visit.",
    maxLength: 10000
  })
  text!: string;

  @ApiPropertyOptional({
    description:
      "Client-generated idempotency key. Re-sending the same captureId returns the existing suggestion instead of creating a duplicate, so offline queues can retry safely.",
    example: "b3aa1c9e-7d10-4f0a-9a3f-2d1f0c6b8e42",
    pattern: "^[A-Za-z0-9_-]{8,64}$"
  })
  captureId?: string;

  @ApiPropertyOptional({
    description:
      "When the capture was originally taken, for captures queued offline and synced later.",
    example: "2026-07-03T08:12:00.000Z",
    nullable: true
  })
  capturedAt?: string | null;
}

export class CaptureResponseDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3", nullable: true })
  suggestionId!: string | null;

  @ApiProperty({ enum: captureStatuses, example: "QUEUED_FOR_REVIEW" })
  status!: (typeof captureStatuses)[number];

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3", nullable: true })
  auditEventId!: string | null;

  @ApiProperty({
    description:
      "True when the captureId matched an existing capture and no new suggestion was created.",
    example: false
  })
  deduplicated!: boolean;
}
