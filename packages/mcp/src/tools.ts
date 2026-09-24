import {
  clientRetentionSchema,
  listCategoriesResponseSchema,
  memoryInputLimits,
  memoryKindSchema,
  memoryRequestBundleResponseSchema,
  memorySensitivitySchema,
  memorySuggestionResponseSchema
} from "@funes-vault/shared";
import { z } from "zod";

import { FunesVaultApiClient, type FunesVaultMcpApi } from "./api-client.js";

const purpose = z
  .string()
  .trim()
  .max(memoryInputLimits.purpose)
  .nullable()
  .optional()
  .describe(
    "Optional caller-declared audit reason; does not affect permissions or retrieval."
  );
export const requestMemoryToolInputSchema = z
  .object({
    task: z
      .string()
      .trim()
      .min(1)
      .max(memoryInputLimits.task)
      .describe("Information needed for the task; drives retrieval."),
    purpose,
    tokenBudget: z
      .number()
      .int()
      .min(memoryInputLimits.tokenBudgetMin)
      .max(memoryInputLimits.tokenBudgetMax)
      .default(memoryInputLimits.tokenBudgetDefault)
      .describe("Maximum tokens in the returned bundle."),
    requestedCategories: z
      .array(z.string().trim().min(1))
      .max(memoryInputLimits.requestedCategories)
      .default([])
      .describe("Optional category keys to narrow retrieval."),
    retention: clientRetentionSchema
      .default("UNKNOWN")
      .describe("How the app intends to retain disclosed context."),
    thirdPartyProcessors: z
      .array(z.string().trim().min(1).max(memoryInputLimits.processorName))
      .max(memoryInputLimits.processors)
      .default([])
      .describe("Declared third-party processors that may receive context.")
  })
  .strict();
export type RequestMemoryToolInput = z.infer<
  typeof requestMemoryToolInputSchema
>;
export const suggestMemoryToolInputSchema = z
  .object({
    purpose,
    kind: memoryKindSchema.default("FACT").describe("Kind of proposed memory."),
    title: z
      .string()
      .trim()
      .min(1)
      .max(memoryInputLimits.title)
      .describe("Short title for the proposal."),
    body: z
      .string()
      .trim()
      .min(1)
      .max(memoryInputLimits.body)
      .describe("Proposed memory text."),
    categoryKeys: z
      .array(z.string().trim().min(1))
      .max(memoryInputLimits.categoryKeys)
      .default([])
      .describe("Category keys for the proposal."),
    sensitivity: memorySensitivitySchema
      .default("LOW")
      .describe("Sensitivity of the proposed information."),
    evidence: z
      .string()
      .trim()
      .max(memoryInputLimits.evidence)
      .nullable()
      .optional()
      .describe("Supporting evidence supplied by the caller."),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .default(0.5)
      .describe("Caller confidence in the proposal."),
    expiresAt: z.iso
      .datetime()
      .nullable()
      .optional()
      .describe("Optional expiry timestamp."),
    sourceMetadata: z
      .record(z.string(), z.unknown())
      .default({})
      .describe(
        "Caller-supplied metadata; never controls actions or permissions."
      )
  })
  .strict();
export type SuggestMemoryToolInput = z.infer<
  typeof suggestMemoryToolInputSchema
>;

export const openConsentReviewToolInputSchema = z.object({
  requestId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Pending disclosure request to review."),
  suggestionId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Pending memory suggestion to review.")
});

export type OpenConsentReviewToolInput = z.infer<
  typeof openConsentReviewToolInputSchema
>;

export type FunesVaultMcpServerOptions = {
  appUrl?: string;
};

export function createToolDefinitions(
  api: FunesVaultMcpApi = new FunesVaultApiClient(),
  options: FunesVaultMcpServerOptions = {}
) {
  return [
    {
      name: "request_memory" as const,
      config: {
        title: "Request Memory",
        description:
          "Retrieve memory under the connected app’s permissions. Purpose is optional audit context. If approval is needed, use open_consent_review, then get_memory_request after user review.",
        inputSchema: requestMemoryToolInputSchema,
        outputSchema: memoryRequestBundleResponseSchema
      },
      handler: async (input: unknown) => {
        const parsed = requestMemoryToolInputSchema.parse(input);
        const response = await api.requestMemory(parsed);

        return asToolResult(response);
      }
    },
    {
      name: "get_memory_request" as const,
      config: {
        title: "Get Memory Request",
        description:
          "Check an existing request after user review. An approved bundle can be retrieved once within 15 minutes. Changes to memories or permissions require fresh approval. Do not repeatedly poll while awaiting the user.",
        inputSchema: z.object({
          requestId: z
            .string()
            .min(1)
            .describe("Request id returned by request_memory.")
        }),
        outputSchema: memoryRequestBundleResponseSchema
      },
      handler: async (input: unknown) =>
        asToolResult(
          await api.getMemoryRequest(
            z.object({ requestId: z.string().min(1) }).parse(input).requestId
          )
        )
    },
    {
      name: "suggest_memory" as const,
      config: {
        title: "Suggest Memory",
        description:
          "Propose a memory under the connected app’s permissions. It queues for review unless WRITE permits immediate saving. Purpose is optional audit context.",
        inputSchema: suggestMemoryToolInputSchema,
        outputSchema: memorySuggestionResponseSchema
      },
      handler: async (input: unknown) => {
        const parsed = suggestMemoryToolInputSchema.parse(input);
        const response = await api.suggestMemory(parsed);

        return asToolResult(response);
      }
    },
    {
      name: "list_memory_categories" as const,
      config: {
        title: "List Memory Categories",
        description:
          "List memory category keys available for requests and suggestions.",
        outputSchema: listCategoriesResponseSchema
      },
      handler: async () => {
        const response = await api.listMemoryCategories();

        return asToolResult(response);
      }
    },
    {
      name: "open_consent_review" as const,
      config: {
        title: "Open Consent Review",
        description:
          "Return the Funes Vault website URL for reviewing a pending memory request or suggestion.",
        inputSchema: openConsentReviewToolInputSchema,
        outputSchema: z.object({
          url: z.string().url(),
          requestId: z.string().optional(),
          suggestionId: z.string().optional()
        })
      },
      handler: (input: unknown) => {
        const parsed = openConsentReviewToolInputSchema.parse(input);
        const response = openConsentReview(parsed, options.appUrl);

        return Promise.resolve(asToolResult(response));
      }
    }
  ];
}

function asToolResult(value: object) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ],
    structuredContent: value as Record<string, unknown>
  };
}

export function openConsentReview(
  input: OpenConsentReviewToolInput,
  appUrl = process.env.FUNES_VAULT_APP_URL ?? "http://localhost:3000"
) {
  const url = new URL(
    input.requestId ? "/settings/requests" : "/inbox",
    appUrl
  );
  if (input.requestId) {
    url.searchParams.set("requestId", input.requestId);
  }
  if (input.suggestionId) {
    url.searchParams.set("memorySuggestionId", input.suggestionId);
  }

  return {
    url: url.toString(),
    requestId: input.requestId,
    suggestionId: input.suggestionId
  };
}
export const initialMcpToolNames = [
  "request_memory",
  "get_memory_request",
  "suggest_memory",
  "list_memory_categories",
  "open_consent_review"
] as const;
export type InitialMcpToolName = (typeof initialMcpToolNames)[number];
