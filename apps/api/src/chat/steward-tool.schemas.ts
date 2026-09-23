import { z } from "zod";
export const requestMemoryInputSchema = z.object({
  task: z
    .string()
    .min(1)
    .max(1000)
    .describe(
      "A focused description of the memory context needed for this turn."
    ),
  requestedCategories: z
    .array(z.string().min(1))
    .max(8)
    .describe(
      "Optional memory category keys to narrow retrieval, such as communication_style or privacy_preferences."
    ),
  tokenBudget: z
    .number()
    .int()
    .min(100)
    .max(1600)
    .describe("Maximum memory-token budget for this request.")
});

export const searchMemoriesInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe("Short subject query, such as cheesecake."),
  categoryKeys: z.array(z.string().min(1)).max(8),
  limit: z.number().int().min(1).max(12)
});

export const updateMemoryInputSchema = z.object({
  memoryId: z.string().min(1),
  title: z.string().min(1).max(180),
  body: z.string().min(1).max(10000),
  kind: z.enum([
    "FACT",
    "PREFERENCE",
    "CONSTRAINT",
    "PROJECT_CONTEXT",
    "GOAL",
    "INSTRUCTION"
  ]),
  sensitivity: z.enum(["LOW", "INTERNAL", "SENSITIVE"]),
  categoryKeys: z.array(z.string().min(1)).min(1).max(8),
  confidence: z.number().min(0).max(1)
});

export const archiveMemoryInputSchema = z.object({
  memoryId: z.string().min(1),
  reason: z.string().min(1).max(500)
});

export const listQueuedSuggestionsInputSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(12)
});

export const rejectSuggestionInputSchema = z.object({
  suggestionId: z.string().min(1)
});
export const completeMemoryCaptureInputSchema = z
  .object({
    candidateId: z.string(),
    resolution: z.enum(["handled", "create", "defer"])
  })
  .strict();
