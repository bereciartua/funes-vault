import { z } from "zod";

import { jsonRecordSchema, requireAtLeastOneField } from "./common.js";
import { paginationQuerySchema, paginationSchema } from "./common.js";
import {
  consolidationModeSchema,
  jobStatusSchema,
  jobTypeSchema
} from "./enums.js";

export const listJobsQuerySchema = paginationQuerySchema.extend({
  type: jobTypeSchema.optional(),
  status: jobStatusSchema.optional()
});

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

export const updateConsolidationSettingsRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: consolidationModeSchema.optional()
  })
  .refine(requireAtLeastOneField, {
    message: "At least one field is required"
  });

export type UpdateConsolidationSettingsRequest = z.infer<
  typeof updateConsolidationSettingsRequestSchema
>;

export const consolidationSettingsSchema = z.object({
  enabled: z.boolean(),
  mode: consolidationModeSchema
});

export type ConsolidationSettings = z.infer<typeof consolidationSettingsSchema>;

export const consolidationSettingsResponseSchema = z.object({
  settings: consolidationSettingsSchema
});

export type ConsolidationSettingsResponse = z.infer<
  typeof consolidationSettingsResponseSchema
>;

export const consolidationActionSummarySchema = z.object({
  action: z.literal("archive_memory"),
  reason: z.enum([
    "expired",
    "exact_duplicate",
    "semantic_duplicate",
    "conflict",
    "superseded"
  ]),
  evidence: z.string().min(1),
  confidence: z.number().min(0).max(1),
  targetMemoryId: z.string().min(1),
  targetLabel: z.string().min(1),
  canonicalMemoryId: z.string().min(1).nullable(),
  canonicalLabel: z.string().min(1).nullable(),
  suggestionId: z.string().min(1).nullable(),
  auditEventId: z.string().min(1).nullable(),
  applied: z.boolean(),
  mode: consolidationModeSchema
});

export type ConsolidationActionSummary = z.infer<
  typeof consolidationActionSummarySchema
>;

export const jobConsolidationSchema = z.object({
  trigger: z.string().min(1),
  mode: consolidationModeSchema,
  inspectedMemoryCount: z.number().int().min(0),
  recentMemoryCount: z.number().int().min(0),
  expiredMemoryCount: z.number().int().min(0),
  candidateCount: z.number().int().min(0),
  suggestionsCreated: z.number().int().min(0),
  actionsAutoApplied: z.number().int().min(0),
  noActionPairs: z.number().int().min(0),
  actions: z.array(consolidationActionSummarySchema)
});

export type JobConsolidation = z.infer<typeof jobConsolidationSchema>;

export const jobRunSchema = z.object({
  id: z.string().min(1),
  type: jobTypeSchema,
  status: jobStatusSchema,
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  metadata: jsonRecordSchema,
  consolidation: jobConsolidationSchema.nullable().default(null),
  error: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export type JobRun = z.infer<typeof jobRunSchema>;

export const jobRunResponseSchema = z.object({
  job: jobRunSchema
});

export type JobRunResponse = z.infer<typeof jobRunResponseSchema>;

export const listJobsResponseSchema = z.object({
  items: z.array(jobRunSchema),
  pagination: paginationSchema
});

export type ListJobsResponse = z.infer<typeof listJobsResponseSchema>;
