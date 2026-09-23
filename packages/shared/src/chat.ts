import { z } from "zod";

import { jsonRecordSchema } from "./common.js";
import { paginationQuerySchema, paginationSchema } from "./common.js";
import { memorySensitivitySchema } from "./enums.js";
import { memoryProcessingResultSchema } from "./memory-processing.js";

export const chatThreadTitleSchema = z.string().trim().min(1).max(80);

export const listChatThreadsQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export type ListChatThreadsQuery = z.infer<typeof listChatThreadsQuerySchema>;

export const chatThreadSummarySchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1).nullable(),
  titleLocked: z.boolean(),
  messageCount: z.number().int().min(0),
  lastMessagePreview: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export type ChatThreadSummary = z.infer<typeof chatThreadSummarySchema>;

export const listChatThreadsResponseSchema = z.object({
  items: z.array(chatThreadSummarySchema),
  pagination: paginationSchema
});

export type ListChatThreadsResponse = z.infer<
  typeof listChatThreadsResponseSchema
>;

export const renameChatThreadRequestSchema = z.object({
  title: chatThreadTitleSchema
});

export type RenameChatThreadRequest = z.infer<
  typeof renameChatThreadRequestSchema
>;

export const processingTimezoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });

      return true;
    } catch {
      return false;
    }
  }, "Use a valid IANA timezone")
  .optional();

export const chatMessageRequestBaseSchema = z.object({
  timezone: processingTimezoneSchema,
  submissionId: z.string().min(1).max(100).optional(),
  sessionId: z.string().min(1).optional(),
  startNewThread: z.boolean().default(false),
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000)
      })
    )
    .max(16)
    .default([])
});

export const chatMessageRequestSchema = chatMessageRequestBaseSchema.refine(
  (request) => !(request.startNewThread && request.sessionId),
  {
    message: "startNewThread cannot be combined with sessionId",
    path: ["startNewThread"]
  }
);

export type ChatMessageRequest = z.infer<typeof chatMessageRequestSchema>;

// Parses text parts from the Vercel AI SDK UIMessage wire shape.
export function textFromUnknownUiMessage(message: unknown) {
  if (typeof message !== "object" || message === null) {
    return "";
  }

  const input = message as Record<string, unknown>;
  if (typeof input.content === "string") {
    return input.content;
  }

  if (!Array.isArray(input.parts)) {
    return "";
  }

  return input.parts
    .map((part) => {
      if (typeof part !== "object" || part === null) {
        return "";
      }

      const candidate = part as Record<string, unknown>;

      return candidate.type === "text" && typeof candidate.text === "string"
        ? candidate.text
        : "";
    })
    .filter((part) => part.length > 0)
    .join("\n");
}

export const chatStreamRequestPreprocessor = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const input = value as Record<string, unknown>;
  if (typeof input.message === "string") {
    return input;
  }

  if (!Array.isArray(input.messages)) {
    return input;
  }

  const messages: unknown[] = input.messages;
  const latestUserMessage = [...messages]
    .reverse()
    .find(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        (message as Record<string, unknown>).role === "user"
    );

  const message = textFromUnknownUiMessage(latestUserMessage).trim();

  return {
    ...input,
    message
  };
};

export const chatStreamMessageRequestSchema = z.preprocess(
  chatStreamRequestPreprocessor,
  chatMessageRequestBaseSchema
    .extend({
      trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
      messageId: z.string().min(1).optional()
    })
    .refine((request) => !(request.startNewThread && request.sessionId), {
      message: "startNewThread cannot be combined with sessionId",
      path: ["startNewThread"]
    })
);

export type ChatStreamMessageRequest = z.infer<
  typeof chatStreamMessageRequestSchema
>;

export const chatCitationSchema = z.object({
  memoryId: z.string().min(1),
  title: z.string().min(1),
  categoryKeys: z.array(z.string().min(1)),
  sensitivity: memorySensitivitySchema,
  relevanceScore: z.number().min(0)
});

export type ChatCitation = z.infer<typeof chatCitationSchema>;

export const chatChannelSchema = z.enum(["text", "voice"]);

export type ChatChannel = z.infer<typeof chatChannelSchema>;

export const chatProviderDisclosureSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  usesThirdParty: z.boolean(),
  disclosure: z.string().min(1),
  channel: chatChannelSchema.optional()
});

export type ChatProviderDisclosure = z.infer<
  typeof chatProviderDisclosureSchema
>;

export const funesMessageMetadataSchema = z.object({
  processing: memoryProcessingResultSchema.optional(),
  sessionId: z.string().min(1).optional(),
  persistedMessageId: z.string().min(1).optional(),
  createdAt: z.iso.datetime().optional(),
  provider: chatProviderDisclosureSchema.optional(),
  finishReason: z.string().min(1).optional()
});

export type FunesMessageMetadata = z.infer<typeof funesMessageMetadataSchema>;

// Owner-side chat actions include UPDATE/ARCHIVE; client disclosure policies include SUMMARIZE.
export const chatToolOperationSchema = z.enum([
  "READ",
  "SUGGEST",
  "WRITE",
  "UPDATE",
  "ARCHIVE",
  "EXPORT"
]);

// REQUIRE_CONFIRMATION maps a suggestion's NEEDS_CONFIRMATION into the chat event vocabulary.
export const chatToolDecisionSchema = z.enum([
  "ALLOW",
  "DENY",
  "REQUIRE_CONFIRMATION"
]);

export const funesToolTraceSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["running", "completed", "failed", "denied"]),
  summary: z.string().min(1),
  metadata: jsonRecordSchema.default({})
});

export const funesDataPartSchemas = {
  "memory-citation": chatCitationSchema.extend({
    ref: z.string().min(1).optional()
  }),
  "provider-disclosure": chatProviderDisclosureSchema,
  "memory-suggestion": z.object({
    suggestionId: z.string().min(1).nullable(),
    title: z.string().min(1),
    status: z.enum(["QUEUED_FOR_REVIEW", "APPLIED", "DENIED", "FAILED"]),
    memoryId: z.string().min(1).nullable().default(null),
    policyId: z.string().min(1).nullable().default(null),
    auditEventId: z.string().min(1).nullable().default(null),
    decision: chatToolDecisionSchema,
    categoryKeys: z.array(z.string().min(1)).default([]),
    sensitivity: memorySensitivitySchema.optional()
  }),
  "policy-decision": z.object({
    operation: chatToolOperationSchema,
    decision: chatToolDecisionSchema,
    clientId: z.string().min(1).nullable().default(null),
    policyId: z.string().min(1).nullable().default(null),
    reasons: z.array(z.string().min(1)).default([])
  }),
  "audit-event": z.object({
    auditEventId: z.string().min(1),
    type: z.string().min(1),
    severity: z.enum(["INFO", "ATTENTION", "RISK"]).default("INFO")
  }),
  "tool-trace": funesToolTraceSchema,
  "thread-state": z.object({
    sessionId: z.string().min(1),
    title: z.string().min(1).nullable().optional(),
    titleLocked: z.boolean().optional(),
    persisted: z.boolean()
  }),
  "transient-notification": z.object({
    level: z.enum(["info", "success", "warning", "error"]),
    message: z.string().min(1)
  })
} as const;

export type FunesDataParts = {
  [Key in keyof typeof funesDataPartSchemas]: z.infer<
    (typeof funesDataPartSchemas)[Key]
  >;
};

export const chatEntrySchema = z.object({
  processing: memoryProcessingResultSchema.optional(),
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  citations: z.array(chatCitationSchema).default([]),
  suggestedMemoryIds: z.array(z.string().min(1)).default([]),
  provider: chatProviderDisclosureSchema.optional(),
  createdAt: z.string().min(1)
});

export type ChatEntry = z.infer<typeof chatEntrySchema>;

export const chatMessageResponseSchema = z.object({
  sessionId: z.string().min(1),
  message: chatEntrySchema,
  answer: z.string().min(1),
  citations: z.array(chatCitationSchema),
  suggestedMemoryIds: z.array(z.string().min(1)),
  provider: chatProviderDisclosureSchema
});

export type ChatMessageResponse = z.infer<typeof chatMessageResponseSchema>;

export const chatSessionResponseSchema = z.object({
  sessionId: z.string().min(1).nullable(),
  title: z.string().min(1).nullable().optional(),
  titleLocked: z.boolean().optional(),
  messages: z.array(chatEntrySchema)
});

export type ChatSessionResponse = z.infer<typeof chatSessionResponseSchema>;

export const chatThreadResponseSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1).nullable(),
  titleLocked: z.boolean(),
  messages: z.array(chatEntrySchema)
});

export type ChatThreadResponse = z.infer<typeof chatThreadResponseSchema>;

export type ChatThreadTitle = z.infer<typeof chatThreadTitleSchema>;

export type ProcessingTimezone = z.infer<typeof processingTimezoneSchema>;

export type ChatMessageRequestBase = z.infer<
  typeof chatMessageRequestBaseSchema
>;

export type ChatToolOperation = z.infer<typeof chatToolOperationSchema>;

export type ChatToolDecision = z.infer<typeof chatToolDecisionSchema>;

export type FunesToolTrace = z.infer<typeof funesToolTraceSchema>;
