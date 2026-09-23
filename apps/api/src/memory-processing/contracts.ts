import { z } from "zod";

import type { ProcessingConfiguration } from "./memory-processing-config.service.js";
const evidenceSchema = z.object({
  messageId: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: z.string().min(1).max(6000)
});
const candidateSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  kind: z.enum([
    "FACT",
    "PREFERENCE",
    "CONSTRAINT",
    "PROJECT_CONTEXT",
    "GOAL",
    "INSTRUCTION"
  ]),
  categoryKeys: z.array(z.string()).min(1).max(8),
  sensitivity: z.enum(["LOW", "INTERNAL", "SENSITIVE", "RESTRICTED"]),
  expiresAt: z.string().nullable(),
  temporalEvidence: z.string().nullable(),
  intent: z.enum([
    "assertion",
    "remember",
    "confirmation",
    "correction",
    "retraction"
  ]),
  atomic: z.boolean(),
  disposition: z.enum(["eligible", "needs_clarification", "rejected"]),
  reason: z.string().max(120),
  evidence: z.array(evidenceSchema).min(1).max(4)
});
export const extractionSchema = z.object({
  candidates: z.array(candidateSchema).max(12),
  partial: z.boolean()
});
export type Candidate = z.infer<typeof candidateSchema>;
export type ExtractionInput = {
  source: { id: string; content: string };
  channel: "chat" | "voice";
  context: { id: string; role: string; content: string }[];
  categories: { key: string; name: string; description: string | null }[];
  now: string;
  timezone: string;
};
export type ProcessingContext = {
  signal: AbortSignal;
  deadline: number;
  correlationId: string;
  configuration: ProcessingConfiguration;
  beforeCall: (payload: unknown) => Promise<void>;
};
export type ExtractionResult = z.infer<typeof extractionSchema> & {
  diagnostics: Record<string, unknown>;
};
export interface MemoryExtractionProvider {
  extract(
    input: ExtractionInput,
    context: ProcessingContext
  ): Promise<ExtractionResult>;
}
export type ConsolidationInput = {
  pairs: {
    id: string;
    left: Record<string, unknown>;
    right: Record<string, unknown>;
    newer: "left" | "right" | "same";
  }[];
};
export const judgmentSchema = z.object({
  decisions: z
    .array(
      z.object({
        pairId: z.string(),
        archive: z.enum(["left", "right"]),
        reason: z.enum(["duplicate", "conflict", "superseded"]),
        confidence: z.number().min(0).max(1),
        evidence: z.string().max(1000)
      })
    )
    .max(40)
});
export type ConsolidationResult = z.infer<typeof judgmentSchema> & {
  diagnostics: Record<string, unknown>;
};
export interface MemoryConsolidationProvider {
  judge(
    input: ConsolidationInput,
    context: ProcessingContext
  ): Promise<ConsolidationResult>;
}

/** Persisted provider snapshot: retries use this configuration, never current environment defaults. */
export const processingConfigurationSchema = z.object({
  rubric: z.string(),
  fingerprint: z.string(),
  extraction: z.object({
    system: z.enum(["system_1", "system_2"]),
    model: z.string(),
    normalizationModel: z.string(),
    timeoutMs: z.number().positive(),
    writeMode: z.enum(["policy", "review"]),
    processors: z.array(z.enum(["typesafe", "openai"])),
    available: z.boolean()
  }),
  consolidation: z.object({
    system: z.enum(["system_1", "system_2"]),
    model: z.string(),
    timeoutMs: z.number().positive(),
    applyMode: z.enum(["user_setting", "review"]),
    maxSensitivity: z.enum([
      "PUBLIC",
      "LOW",
      "INTERNAL",
      "SENSITIVE",
      "RESTRICTED",
      "SECRET"
    ]),
    processors: z.array(z.enum(["typesafe", "openai"])),
    available: z.boolean()
  })
});
export const pendingCandidatesSchema = z.array(candidateSchema);
export const reconciliationReceiptSchema = z.object({
  toolName: z.string(),
  recordIds: z.array(z.string())
});
export const reconciliationToolArgsSchema = z.object({
  memoryId: z.string().optional(),
  suggestionId: z.string().optional()
});
export const reconciliationToolOutputSchema = z.object({
  items: z.array(z.object({ id: z.string() })).optional()
});
