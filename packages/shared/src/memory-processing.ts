import { z } from "zod";

import { jsonRecordSchema } from "./common.js";
import { memorySensitivitySchema } from "./enums.js";

export const memoryProcessingTaskSchema = z.object({
  system: z.string(),
  model: z.string(),
  available: z.boolean(),
  processors: z.array(z.string())
});
export const processingConsentSchema = z.object({
  processor: z.string(),
  scope: z.string(),
  revokedAt: z.iso.datetime().nullable(),
  version: z.number().int(),
  grantedAt: z.iso.datetime().optional()
});
export const memoryProcessingCapabilitiesSchema = z.object({
  fingerprint: z.string(),
  extraction: memoryProcessingTaskSchema,
  consolidation: memoryProcessingTaskSchema.extend({
    maxSensitivity: memorySensitivitySchema
  }),
  consentVersion: z.number().int().optional(),
  consents: z.array(processingConsentSchema)
});
export const processingConsentRequestSchema = z.object({
  scope: z.enum(["extraction", "consolidation"]),
  granted: z.boolean(),
  version: z.literal(1)
});
export const memoryProcessingOutcomeSchema = z
  .object({
    status: z.string(),
    candidateId: z.string().optional(),
    memoryId: z.string().nullable().optional(),
    suggestionId: z.string().nullable().optional(),
    title: z.string().optional(),
    categoryKeys: z.array(z.string()).optional(),
    sensitivity: memorySensitivitySchema.optional(),
    reason: z.string().nullable().optional()
  })
  .catchall(z.unknown());
export const memoryProcessingResultSchema = z
  .object({
    status: z.enum([
      "pending",
      "running",
      "completed",
      "partial",
      "failed",
      "skipped",
      "unavailable"
    ]),
    runId: z.string().optional(),
    sourceMessageId: z.string().optional(),
    outcomes: z.array(memoryProcessingOutcomeSchema).optional(),
    processors: z.array(z.string()).optional(),
    model: z.string().optional(),
    rubric: z.string().optional(),
    fingerprint: z.string().optional(),
    latencyMs: z.number().nonnegative().optional(),
    diagnostics: jsonRecordSchema.optional(),
    reason: z.string().nullable().optional()
  })
  .catchall(z.unknown());
export const consolidationSemanticMetadataSchema = z
  .object({
    status: z.string().optional(),
    model: z.string().optional(),
    skippedPairs: z.number().int().nonnegative().optional()
  })
  .catchall(z.unknown());
export type MemoryProcessingTask = z.infer<typeof memoryProcessingTaskSchema>;
export type ProcessingConsent = z.infer<typeof processingConsentSchema>;
export type ProcessingConsentRequest = z.infer<
  typeof processingConsentRequestSchema
>;
export type MemoryProcessingCapabilities = z.infer<
  typeof memoryProcessingCapabilitiesSchema
>;
export type MemoryProcessingOutcome = z.infer<
  typeof memoryProcessingOutcomeSchema
>;
export type MemoryProcessingResult = z.infer<
  typeof memoryProcessingResultSchema
>;
export type ConsolidationSemanticMetadata = z.infer<
  typeof consolidationSemanticMetadataSchema
>;
