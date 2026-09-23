import { z } from "zod";

import {
  chatCitationSchema,
  chatEntrySchema,
  chatProviderDisclosureSchema,
  funesDataPartSchemas,
  processingTimezoneSchema
} from "./chat.js";
import { jsonRecordSchema } from "./common.js";

export const createVoiceSessionRequestSchema = z.object({
  timezone: processingTimezoneSchema,
  sessionId: z.string().min(1).optional(),
  startNewThread: z.boolean().optional()
});

export type CreateVoiceSessionRequest = z.infer<
  typeof createVoiceSessionRequestSchema
>;

export const voiceSessionLimitsSchema = z.object({
  maxDurationSeconds: z.number().int().min(1),
  idleTimeoutSeconds: z.number().int().min(1),
  dailySessionCap: z.number().int().min(1),
  dailySessionsUsed: z.number().int().min(0)
});

export type VoiceSessionLimits = z.infer<typeof voiceSessionLimitsSchema>;

export const voiceSessionResponseSchema = z.object({
  voiceSessionId: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().nullable(),
  model: z.string().min(1),
  voice: z.string().min(1),
  clientSecret: z.object({
    value: z.string().min(1),
    expiresAt: z.iso.datetime()
  }),
  limits: voiceSessionLimitsSchema,
  provider: chatProviderDisclosureSchema
});

export type VoiceSessionResponse = z.infer<typeof voiceSessionResponseSchema>;

export const voiceToolCallRequestSchema = z.object({
  sourceItemId: z.string().min(1).optional(),
  toolName: z.string().min(1).max(80),
  toolCallId: z.string().min(1).max(120),
  arguments: jsonRecordSchema.default({})
});

export type VoiceToolCallRequest = z.infer<typeof voiceToolCallRequestSchema>;

export const stewardToolEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("memory-citation"),
    data: funesDataPartSchemas["memory-citation"]
  }),
  z.object({
    type: z.literal("policy-decision"),
    data: funesDataPartSchemas["policy-decision"]
  }),
  z.object({
    type: z.literal("memory-suggestion"),
    data: funesDataPartSchemas["memory-suggestion"]
  }),
  z.object({
    type: z.literal("audit-event"),
    data: funesDataPartSchemas["audit-event"]
  }),
  z.object({
    type: z.literal("tool-trace"),
    data: funesDataPartSchemas["tool-trace"]
  })
]);

export type StewardToolEventPayload = z.infer<typeof stewardToolEventSchema>;

export const voiceToolCallResponseSchema = z.object({
  output: z.unknown(),
  events: z.array(stewardToolEventSchema)
});

export type VoiceToolCallResponse = z.infer<typeof voiceToolCallResponseSchema>;

export const voiceTurnRequestSchema = z.object({
  timezone: processingTimezoneSchema,
  itemId: z.string().min(1).max(200).optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(20000),
  citations: z.array(chatCitationSchema).default([]),
  suggestedMemoryIds: z.array(z.string().min(1)).default([])
});

export type VoiceTurnRequest = z.infer<typeof voiceTurnRequestSchema>;

export const voiceTurnResponseSchema = z.object({
  message: chatEntrySchema,
  title: z.string().nullable()
});

export type VoiceTurnResponse = z.infer<typeof voiceTurnResponseSchema>;

export const voiceSessionEndReasonSchema = z.enum([
  "user_ended",
  "max_duration",
  "idle_timeout",
  "connection_lost",
  "error"
]);

export type VoiceSessionEndReason = z.infer<typeof voiceSessionEndReasonSchema>;

export const endVoiceSessionRequestSchema = z.object({
  reason: voiceSessionEndReasonSchema.default("user_ended")
});

export type EndVoiceSessionRequest = z.infer<
  typeof endVoiceSessionRequestSchema
>;

export const voiceSessionEndedResponseSchema = z.object({
  voiceSessionId: z.string().min(1),
  endedAt: z.iso.datetime(),
  endReason: voiceSessionEndReasonSchema
});

export type VoiceSessionEndedResponse = z.infer<
  typeof voiceSessionEndedResponseSchema
>;
