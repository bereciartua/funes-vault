import { z } from "zod";

import {
  deniedMemorySchema,
  paginationSchema,
  statedPurposeSchema
} from "./common.js";
import {
  clientRetentionSchema,
  memoryRequestReasonSchema,
  memoryRequestStatusSchema,
  memorySensitivitySchema
} from "./enums.js";
import { memoryInputLimits } from "./memory-input-limits.js";

export const memoryRequestInputPreprocessor = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const input = value as Record<string, unknown>;

  return {
    ...input,
    requestedCategories:
      input.requestedCategories ?? input.requested_categories,
    thirdPartyProcessors:
      input.thirdPartyProcessors ?? input.third_party_processors,
    tokenBudget: input.tokenBudget ?? input.token_budget
  };
};

export const createMemoryBundleRequestSchema = z.preprocess(
  memoryRequestInputPreprocessor,
  z.object({
    purpose: statedPurposeSchema,
    task: z
      .string()
      .trim()
      .min(1)
      .max(memoryInputLimits.task)
      .describe("Information needed for this task; drives retrieval."),
    requestedCategories: z
      .array(z.string().trim().min(1))
      .max(memoryInputLimits.requestedCategories)
      .default([]),
    retention: clientRetentionSchema.default("UNKNOWN"),
    thirdPartyProcessors: z
      .array(z.string().trim().min(1).max(memoryInputLimits.processorName))
      .max(memoryInputLimits.processors)
      .default([]),
    tokenBudget: z
      .number()
      .int()
      .min(memoryInputLimits.tokenBudgetMin)
      .max(memoryInputLimits.tokenBudgetMax)
      .default(memoryInputLimits.tokenBudgetDefault)
  })
);

export type CreateMemoryBundleRequest = z.infer<
  typeof createMemoryBundleRequestSchema
>;

export const memoryBundleItemSchema = z.object({
  memoryId: z.string().min(1),
  text: z.string().min(1),
  category: z.string().nullable(),
  sensitivity: memorySensitivitySchema,
  relevanceScore: z.number().min(0).optional(),
  estimatedTokens: z.number().int().min(1)
});

export type MemoryBundleItem = z.infer<typeof memoryBundleItemSchema>;

export const memoryRequestBundleResponseSchema = z.object({
  requestId: z.string().min(1),
  status: memoryRequestStatusSchema,
  policyId: z.string().nullable(),
  reason: memoryRequestReasonSchema.nullable(),
  tokenBudget: z.number().int().min(1),
  estimatedTokens: z.number().int().min(0),
  items: z.array(memoryBundleItemSchema),
  instructions: z.array(z.string().min(1)),
  denied: z.array(deniedMemorySchema),
  auditEventId: z.string().nullable()
});

export type MemoryRequestBundleResponse = z.infer<
  typeof memoryRequestBundleResponseSchema
>;

export const memoryRequestReviewSummarySchema = z.object({
  id: z.string(),
  clientName: z.string(),
  statedPurpose: z.string().nullable(),
  policyId: z.string().nullable(),
  policyVersion: z.string().nullable(),
  reason: memoryRequestReasonSchema.nullable(),
  task: z.string(),
  status: memoryRequestStatusSchema,
  retention: clientRetentionSchema,
  thirdPartyProcessors: z.array(z.string()),
  createdAt: z.iso.datetime()
});

export const memoryRequestReviewsResponseSchema = z.object({
  items: z.array(memoryRequestReviewSummarySchema),
  pagination: paginationSchema
});

export const memoryRequestPreviewSchema = z.object({
  approvalExpired: z.boolean().optional(),
  request: memoryRequestReviewSummarySchema,
  revision: z.string(),
  items: z.array(memoryBundleItemSchema),
  canApprove: z.boolean()
});

export type MemoryRequestPreview = z.infer<typeof memoryRequestPreviewSchema>;

export const reviewDisclosureRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deny") }),
  z.object({
    action: z.literal("approve"),
    revision: z.string().min(1),
    memoryIds: z.array(z.string().min(1)).min(1).max(30)
  })
]);

export type MemoryRequestReviewSummary = z.infer<
  typeof memoryRequestReviewSummarySchema
>;

export type MemoryRequestReviewsResponse = z.infer<
  typeof memoryRequestReviewsResponseSchema
>;

export type ReviewDisclosureRequest = z.infer<
  typeof reviewDisclosureRequestSchema
>;
