import { MemoryKind, MemorySensitivity } from "@funes-vault/db";
import { ApiProperty } from "@nestjs/swagger";

import { PaginationDto } from "../common/pagination.dto.js";

const memoryKinds = Object.values(MemoryKind);

const memorySensitivities = Object.values(MemorySensitivity);

export class ChatMessageRequestDto {
  @ApiProperty({
    required: false,
    description: "IANA timezone for interpreting dates in this source turn."
  })
  timezone?: string;

  @ApiProperty({
    required: false,
    description:
      "Stable client-generated turn ID, unique per user. Retries reuse the accepted source and thread. Different text with the same ID returns 409."
  })
  submissionId?: string;

  @ApiProperty({
    required: false,
    example: "cmqvt0v580000xeg7jgy7v1u3"
  })
  sessionId?: string;

  @ApiProperty({
    required: false,
    default: false,
    description:
      "Create a fresh persisted thread as part of accepting this message. Must not be combined with sessionId."
  })
  startNewThread?: boolean;

  @ApiProperty({ example: "What do you know about how I like to work?" })
  message!: string;
}

class ChatCitationDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  memoryId!: string;

  @ApiProperty({ example: "Prefers concise technical help" })
  title!: string;

  @ApiProperty({ type: [String], example: ["communication_style"] })
  categoryKeys!: string[];

  @ApiProperty({ enum: memorySensitivities, example: "LOW" })
  sensitivity!: (typeof memorySensitivities)[number];

  @ApiProperty({ example: 0.85 })
  relevanceScore!: number;
}

class ChatProviderDisclosureDto {
  @ApiProperty({ example: "openai" })
  provider!: string;

  @ApiProperty({ example: "gpt-5.5" })
  model!: string;

  @ApiProperty({ example: true })
  usesThirdParty!: boolean;

  @ApiProperty({
    example:
      "When configured, chat sends the current message and retrieved memory snippets to OpenAI."
  })
  disclosure!: string;
}

class ChatEntryDto {
  @ApiProperty({
    required: false,
    type: Object,
    additionalProperties: true,
    description:
      "Durable memory processing status, run/source IDs, processors, and saved/queued/pending outcomes."
  })
  processing?: Record<string, unknown>;

  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ enum: ["user", "assistant"], example: "assistant" })
  role!: "user" | "assistant";

  @ApiProperty({
    example:
      "Your vault says you prefer concise technical help with concrete next steps. [1]"
  })
  content!: string;

  @ApiProperty({ type: [ChatCitationDto] })
  citations!: ChatCitationDto[];

  @ApiProperty({ type: [String], example: ["cmqvt0v580000xeg7jgy7v1u3"] })
  suggestedMemoryIds!: string[];

  @ApiProperty({ type: ChatProviderDisclosureDto, required: false })
  provider?: ChatProviderDisclosureDto;

  @ApiProperty({ example: "2026-06-27T14:30:00.000Z" })
  createdAt!: string;
}

export class ChatMessageResponseDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  sessionId!: string;

  @ApiProperty({ type: ChatEntryDto })
  message!: ChatEntryDto;

  @ApiProperty({
    example:
      "Your vault says you prefer concise technical help with concrete next steps. [1]"
  })
  answer!: string;

  @ApiProperty({ type: [ChatCitationDto] })
  citations!: ChatCitationDto[];

  @ApiProperty({ type: [String], example: ["cmqvt0v580000xeg7jgy7v1u3"] })
  suggestedMemoryIds!: string[];

  @ApiProperty({ type: ChatProviderDisclosureDto })
  provider!: ChatProviderDisclosureDto;
}

export class ChatSessionResponseDto {
  @ApiProperty({
    example: "cmqvt0v580000xeg7jgy7v1u3",
    nullable: true
  })
  sessionId!: string | null;

  @ApiProperty({ example: "Coding assistant collaboration", nullable: true })
  title!: string | null;

  @ApiProperty({ example: false })
  titleLocked!: boolean;

  @ApiProperty({ type: [ChatEntryDto] })
  messages!: ChatEntryDto[];
}

export class ChatThreadResponseDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  sessionId!: string;

  @ApiProperty({ example: "Coding assistant collaboration", nullable: true })
  title!: string | null;

  @ApiProperty({ example: false })
  titleLocked!: boolean;

  @ApiProperty({ type: [ChatEntryDto] })
  messages!: ChatEntryDto[];
}

export class ChatThreadSummaryDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  sessionId!: string;

  @ApiProperty({ example: "Coding assistant collaboration", nullable: true })
  title!: string | null;

  @ApiProperty({ example: false })
  titleLocked!: boolean;

  @ApiProperty({ example: 8 })
  messageCount!: number;

  @ApiProperty({
    example: "We captured your preference for concise implementation help.",
    nullable: true
  })
  lastMessagePreview!: string | null;

  @ApiProperty({ example: "2026-06-29T14:30:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "2026-06-29T14:52:00.000Z" })
  updatedAt!: string;
}

export class ListChatThreadsResponseDto {
  @ApiProperty({ type: [ChatThreadSummaryDto] })
  items!: ChatThreadSummaryDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}

export class RenameChatThreadRequestDto {
  @ApiProperty({ example: "Planning conversations", maxLength: 80 })
  title!: string;
}

class GuidedQuestionDto {
  @ApiProperty({ example: "collaboration_style" })
  id!: string;

  @ApiProperty({ example: "Collaboration style" })
  category!: string;

  @ApiProperty({
    example: "How do you like AI assistants to collaborate with you?"
  })
  prompt!: string;

  @ApiProperty({ type: [String], example: ["communication_style"] })
  categoryKeys!: string[];

  @ApiProperty({ enum: memoryKinds, example: "PREFERENCE" })
  suggestedKind!: (typeof memoryKinds)[number];

  @ApiProperty({ enum: memorySensitivities, example: "LOW" })
  suggestedSensitivity!: (typeof memorySensitivities)[number];
}

export class GuidedQuestionsResponseDto {
  @ApiProperty({ type: [GuidedQuestionDto] })
  items!: GuidedQuestionDto[];
}

class OnboardingAnswerDto {
  @ApiProperty({ example: "collaboration_style" })
  questionId!: string;

  @ApiProperty({
    example: "I prefer direct implementation when intent is clear."
  })
  answer!: string;
}

export class CreateOnboardingSuggestionsDto {
  @ApiProperty({ type: [OnboardingAnswerDto] })
  answers!: OnboardingAnswerDto[];
}

class OnboardingSuggestionDto {
  @ApiProperty({ example: "cmqvt0v580000xeg7jgy7v1u3" })
  id!: string;

  @ApiProperty({ example: "Collaboration preference" })
  title!: string;

  @ApiProperty({ example: "The user prefers direct implementation." })
  body!: string;
}

export class OnboardingSuggestionsResponseDto {
  @ApiProperty({ type: [OnboardingSuggestionDto] })
  suggestions!: OnboardingSuggestionDto[];
}
