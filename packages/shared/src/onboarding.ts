import { z } from "zod";

import { memoryKindSchema, memorySensitivitySchema } from "./enums.js";
import { reviewableMemorySuggestionSchema } from "./memory-suggestions.js";

export const guidedQuestionSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  prompt: z.string().min(1),
  categoryKeys: z.array(z.string().min(1)),
  suggestedKind: memoryKindSchema,
  suggestedSensitivity: memorySensitivitySchema
});

export type GuidedQuestion = z.infer<typeof guidedQuestionSchema>;

export const guidedQuestionsResponseSchema = z.object({
  items: z.array(guidedQuestionSchema)
});

export type GuidedQuestionsResponse = z.infer<
  typeof guidedQuestionsResponseSchema
>;

export const createOnboardingSuggestionsSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1),
        answer: z.string().trim().min(1).max(4000)
      })
    )
    .min(1)
    .max(20)
});

export type CreateOnboardingSuggestions = z.infer<
  typeof createOnboardingSuggestionsSchema
>;

export const onboardingSuggestionsResponseSchema = z.object({
  suggestions: z.array(reviewableMemorySuggestionSchema)
});

export type OnboardingSuggestionsResponse = z.infer<
  typeof onboardingSuggestionsResponseSchema
>;
