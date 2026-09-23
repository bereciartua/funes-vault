import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const voiceEndReasons = [
  "user_ended",
  "max_duration",
  "idle_timeout",
  "connection_lost",
  "error"
] as const;

export class CreateVoiceSessionDto {
  @ApiPropertyOptional({
    description:
      "Existing chat thread to continue by voice. Omit to start a new thread.",
    example: "cmqvt0v580000xeg7jgy7v1u3"
  })
  sessionId?: string;

  @ApiPropertyOptional({
    description: "Force a fresh thread even when sessionId is provided.",
    example: false
  })
  startNewThread?: boolean;
}

class VoiceClientSecretDto {
  @ApiProperty({
    description:
      "Ephemeral Realtime client secret. Short-lived; the provider API key never reaches the browser.",
    example: "ek_abc123"
  })
  value!: string;

  @ApiProperty({ example: "2026-07-04T12:02:00.000Z" })
  expiresAt!: string;
}

class VoiceSessionLimitsDto {
  @ApiProperty({ example: 600 })
  maxDurationSeconds!: number;

  @ApiProperty({ example: 90 })
  idleTimeoutSeconds!: number;

  @ApiProperty({ example: 20 })
  dailySessionCap!: number;

  @ApiProperty({ example: 3 })
  dailySessionsUsed!: number;
}

class VoiceProviderDisclosureDto {
  @ApiProperty({ example: "openai" })
  provider!: string;

  @ApiProperty({ example: "gpt-realtime-2" })
  model!: string;

  @ApiProperty({ example: true })
  usesThirdParty!: boolean;

  @ApiProperty({ enum: ["text", "voice"], example: "voice" })
  channel!: "text" | "voice";

  @ApiProperty({
    example:
      "Voice sessions stream your microphone audio and any retrieved memory text to the OpenAI Realtime API and receive synthesized speech back."
  })
  disclosure!: string;
}

export class VoiceSessionResponseDto {
  @ApiProperty({ example: "cmr5vs0000001l7g7abcd1234" })
  voiceSessionId!: string;

  @ApiProperty({
    description: "Chat thread the voice transcripts persist into.",
    example: "cmqvt0v580000xeg7jgy7v1u3"
  })
  sessionId!: string;

  @ApiProperty({ example: null, nullable: true })
  title!: string | null;

  @ApiProperty({ example: "gpt-realtime-2" })
  model!: string;

  @ApiProperty({ example: "cedar" })
  voice!: string;

  @ApiProperty({ type: VoiceClientSecretDto })
  clientSecret!: VoiceClientSecretDto;

  @ApiProperty({ type: VoiceSessionLimitsDto })
  limits!: VoiceSessionLimitsDto;

  @ApiProperty({ type: VoiceProviderDisclosureDto })
  provider!: VoiceProviderDisclosureDto;
}

export class VoiceToolCallDto {
  @ApiPropertyOptional({
    description:
      "Finalized user Realtime item ID that owns the extraction result. Missing or not-yet-persisted sources return pending for capture tools."
  })
  sourceItemId?: string;

  @ApiProperty({ example: "request_memory" })
  toolName!: string;

  @ApiProperty({
    description: "Realtime function call id, echoed into tool traces.",
    example: "call_abc123"
  })
  toolCallId!: string;

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: true,
    example: {
      task: "communication preferences",
      requestedCategories: [],
      tokenBudget: 800
    }
  })
  arguments?: Record<string, unknown>;
}

class StewardToolEventDto {
  @ApiProperty({
    enum: [
      "memory-citation",
      "policy-decision",
      "memory-suggestion",
      "audit-event",
      "tool-trace"
    ],
    example: "tool-trace"
  })
  type!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  data!: Record<string, unknown>;
}

export class VoiceToolCallResponseDto {
  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "Tool output to return to the Realtime model."
  })
  output!: unknown;

  @ApiProperty({ type: [StewardToolEventDto] })
  events!: StewardToolEventDto[];
}

export class VoiceTurnDto {
  @ApiProperty({
    required: false,
    description: "IANA timezone for interpreting dates in this source turn."
  })
  timezone?: string;

  @ApiPropertyOptional({
    description:
      "Stable Realtime item ID. Duplicate delivery reuses the message; changed content is rejected."
  })
  itemId?: string;

  @ApiProperty({ enum: ["user", "assistant"], example: "assistant" })
  role!: "user" | "assistant";

  @ApiProperty({
    example: "Your vault says you prefer concise answers, so I kept it short."
  })
  content!: string;

  @ApiPropertyOptional({
    type: "array",
    items: { type: "object", additionalProperties: true },
    description: "Citations gathered from request_memory calls in this turn."
  })
  citations?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ type: [String] })
  suggestedMemoryIds?: string[];
}

export class VoiceTurnResponseDto {
  @ApiProperty({ type: "object", additionalProperties: true })
  message!: Record<string, unknown>;

  @ApiProperty({ example: "Voice check-in", nullable: true })
  title!: string | null;
}

export class EndVoiceSessionDto {
  @ApiPropertyOptional({ enum: voiceEndReasons, example: "user_ended" })
  reason?: (typeof voiceEndReasons)[number];
}

export class VoiceSessionEndedResponseDto {
  @ApiProperty({ example: "cmr5vs0000001l7g7abcd1234" })
  voiceSessionId!: string;

  @ApiProperty({ example: "2026-07-04T12:10:00.000Z" })
  endedAt!: string;

  @ApiProperty({ enum: voiceEndReasons, example: "user_ended" })
  endReason!: (typeof voiceEndReasons)[number];
}
