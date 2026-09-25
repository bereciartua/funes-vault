import { z } from "zod";

import { jsonRecordSchema } from "./common.js";
import { memorySensitivitySchema } from "./enums.js";

export const memoryProcessingTaskSchema = z.object({
  system: z.enum(["system_1", "system_2"]),
  model: z.string(),
  available: z.boolean(),
  processors: z.array(z.string())
});
export const memoryProcessingCapabilitiesSchema = z.object({
  fingerprint: z.string(),
  extraction: memoryProcessingTaskSchema,
  consolidation: memoryProcessingTaskSchema.extend({
    maxSensitivity: memorySensitivitySchema
  }),
  options: z.object({
    extraction: z.object({ typesafe: z.boolean(), openai: z.boolean() }),
    consolidation: z.object({ typesafe: z.boolean(), openai: z.boolean() })
  })
});
export const processingProviderRequestSchema = z.object({
  scope: z.enum(["extraction", "consolidation"]),
  system: z.enum(["system_1", "system_2"])
});
export type ProcessingProviderRequest = z.infer<
  typeof processingProviderRequestSchema
>;
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
    maxSensitivity: memorySensitivitySchema.optional(),
    reason: z.string().nullable().optional(),
    skippedPairs: z.number().int().nonnegative().optional(),
    skippedSources: z.number().int().nonnegative().optional(),
    skippedSourceReasons: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
    deferredPairs: z.number().int().nonnegative().optional()
  })
  .catchall(z.unknown());
export type MemoryProcessingTask = z.infer<typeof memoryProcessingTaskSchema>;
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

export function consolidationFailureMessage(reason?: string | null) {
  switch (reason) {
    case "processing_consent_required":
      return "This run used an older TypeSafe permission. Choose a provider in Settings → Profile, then start a new consolidation run.";
    case "processing_provider_changed":
      return "The provider changed while this run was active. Start a new consolidation run with the current choice.";
    case "provider_not_configured":
      return "Memory comparison is unavailable because its provider is not configured. Ask your vault administrator to check the processing configuration.";
    case "source_versions_changed":
      return "Some memories changed after this run started. Start a new consolidation run to check their current versions.";
    case "pair_limit_reached":
      return "The comparison limit was reached. Some memory comparisons remain unfinished.";
    case "secret_like_content":
      return "Memory comparison was blocked because the request contained possible credentials. Review your memories before starting another run.";
    case "rate_limited":
      return "The comparison service is receiving too many requests. Wait a few minutes, then retry.";
    case "deadline_or_cancelled":
      return "Memory comparison did not finish within the time limit. You can retry this run.";
    default:
      return "Memory comparison could not finish. You can retry this run. Any local maintenance already completed is recorded below.";
  }
}
