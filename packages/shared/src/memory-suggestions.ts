import { z } from "zod";

import {
  deniedMemorySchema,
  jsonRecordSchema,
  nullableDatetimeSchema,
  paginationQuerySchema,
  paginationSchema,
  statedPurposeSchema
} from "./common.js";
import { memoryRequestReasonSchema } from "./enums.js";
import {
  memoryKindSchema,
  memorySensitivitySchema,
  memorySuggestionStatusSchema,
  sourceTypeSchema
} from "./enums.js";
import { memorySchema, provenanceSubjectSchema } from "./memories.js";
import { memoryInputLimits } from "./memory-input-limits.js";

export const memorySuggestionInputPreprocessor = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const input = value as Record<string, unknown>;
  const kind = input.kind ?? input.suggestedKind ?? input.suggested_kind;
  const sensitivity =
    input.sensitivity ??
    input.suggestedSensitivity ??
    input.suggested_sensitivity;

  return {
    ...input,
    kind: typeof kind === "string" ? kind.trim().toUpperCase() : kind,
    sensitivity:
      typeof sensitivity === "string"
        ? sensitivity.trim().toUpperCase()
        : sensitivity,
    categoryKeys: input.categoryKeys ?? input.category_keys ?? input.categories,
    expiresAt: input.expiresAt ?? input.expires_at,
    sourceMetadata: input.sourceMetadata ?? input.source_metadata
  };
};

export const createMemorySuggestionRequestSchema = z.preprocess(
  memorySuggestionInputPreprocessor,
  z.object({
    purpose: statedPurposeSchema,
    kind: memoryKindSchema.default("FACT"),
    title: z.string().trim().min(1).max(memoryInputLimits.title),
    body: z.string().trim().min(1).max(memoryInputLimits.body),
    categoryKeys: z
      .array(z.string().trim().min(1))
      .max(memoryInputLimits.categoryKeys)
      .default([]),
    sensitivity: memorySensitivitySchema.default("LOW"),
    evidence: z
      .string()
      .trim()
      .max(memoryInputLimits.evidence)
      .nullable()
      .optional(),
    confidence: z.number().min(0).max(1).default(0.5),
    expiresAt: nullableDatetimeSchema,
    sourceMetadata: jsonRecordSchema.default({})
  })
);

export type CreateMemorySuggestionRequest = z.infer<
  typeof createMemorySuggestionRequestSchema
>;

export const memorySuggestionResponseSchema = z.object({
  suggestionId: z.string().min(1).nullable(),
  memoryId: z.string().min(1).nullable().default(null),
  status: z.union([memorySuggestionStatusSchema, z.literal("DENIED")]),
  policyId: z.string().nullable(),
  reason: memoryRequestReasonSchema.nullable(),
  auditEventId: z.string().min(1).nullable(),
  decision: z.enum(["ALLOW", "NEEDS_CONFIRMATION", "DENY"]),
  denied: z.array(deniedMemorySchema)
});

export type MemorySuggestionResponse = z.infer<
  typeof memorySuggestionResponseSchema
>;

export const reviewableMemorySuggestionSchema = z.object({
  statedPurpose: z.string().nullable(),
  policyId: z.string().nullable(),
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  kind: memoryKindSchema,
  sensitivity: memorySensitivitySchema,
  categoryKeys: z.array(z.string().min(1)),
  evidence: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  expiresAt: z.iso.datetime().nullable(),
  status: memorySuggestionStatusSchema,
  source: z.object({
    type: sourceTypeSchema,
    clientId: z.string().nullable(),
    metadata: jsonRecordSchema,
    subjects: z.array(provenanceSubjectSchema).default([])
  }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export type ReviewableMemorySuggestion = z.infer<
  typeof reviewableMemorySuggestionSchema
>;

export const createCaptureRequestSchema = z.object({
  text: z.string().trim().min(1).max(memoryInputLimits.body),
  captureId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .optional(),
  capturedAt: nullableDatetimeSchema
});

export type CreateCaptureRequest = z.infer<typeof createCaptureRequestSchema>;

export const captureResponseSchema = z.object({
  reason: memoryRequestReasonSchema.nullable(),
  suggestionId: z.string().min(1).nullable(),
  status: z.union([memorySuggestionStatusSchema, z.literal("DENIED")]),
  auditEventId: z.string().min(1).nullable(),
  deduplicated: z.boolean()
});

export type CaptureResponse = z.infer<typeof captureResponseSchema>;

export const listMemorySuggestionsQuerySchema = paginationQuerySchema.extend({
  status: memorySuggestionStatusSchema
    .or(z.literal("ALL"))
    .default("QUEUED_FOR_REVIEW")
});

export type ListMemorySuggestionsQuery = z.infer<
  typeof listMemorySuggestionsQuerySchema
>;

export const listMemorySuggestionsResponseSchema = z.object({
  items: z.array(reviewableMemorySuggestionSchema),
  pagination: paginationSchema
});

export type ListMemorySuggestionsResponse = z.infer<
  typeof listMemorySuggestionsResponseSchema
>;

export const memorySuggestionReviewResponseSchema = z.object({
  suggestion: reviewableMemorySuggestionSchema,
  memory: memorySchema.optional()
});

export type MemorySuggestionReviewResponse = z.infer<
  typeof memorySuggestionReviewResponseSchema
>;

export const bulkReviewMemorySuggestionsRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["apply", "reject"])
});

export type BulkReviewMemorySuggestionsRequest = z.infer<
  typeof bulkReviewMemorySuggestionsRequestSchema
>;

export const bulkReviewMemorySuggestionResultSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["applied", "rejected", "failed"]),
  suggestion: reviewableMemorySuggestionSchema.optional(),
  memory: memorySchema.optional(),
  error: z.string().min(1).optional()
});

export type BulkReviewMemorySuggestionResult = z.infer<
  typeof bulkReviewMemorySuggestionResultSchema
>;

export const bulkReviewMemorySuggestionsResponseSchema = z.object({
  action: z.enum(["apply", "reject"]),
  requested: z.number().int().min(0),
  succeeded: z.number().int().min(0),
  failed: z.number().int().min(0),
  results: z.array(bulkReviewMemorySuggestionResultSchema)
});

export type BulkReviewMemorySuggestionsResponse = z.infer<
  typeof bulkReviewMemorySuggestionsResponseSchema
>;
