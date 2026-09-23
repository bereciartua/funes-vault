import {
  type CreateMemoryBundleRequest,
  createMemoryBundleRequestSchema,
  type CreateMemorySuggestionRequest,
  createMemorySuggestionRequestSchema,
  listCategoriesResponseSchema,
  memoryRequestBundleResponseSchema,
  memorySuggestionResponseSchema
} from "@funes-vault/shared";
import { z } from "zod";

import { FunesVaultApiClient, type FunesVaultMcpApi } from "./api-client.js";

export const requestMemoryToolInputSchema = createMemoryBundleRequestSchema;
export type RequestMemoryToolInput = CreateMemoryBundleRequest;

export const suggestMemoryToolInputSchema = createMemorySuggestionRequestSchema;
export type SuggestMemoryToolInput = CreateMemorySuggestionRequest;

export const openConsentReviewToolInputSchema = z.object({
  requestId: z.string().trim().min(1).optional(),
  suggestionId: z.string().trim().min(1).optional()
});

export type OpenConsentReviewToolInput = z.infer<
  typeof openConsentReviewToolInputSchema
>;

export type FunesVaultMcpServerOptions = {
  appUrl?: string;
  /**
   * Purpose string the client's access policy grants (for example
   * "general_context"). Policies match purposes exactly, and the calling
   * model fills the purpose field, so advertising the granted purpose in
   * the tool descriptions is what lets a policy apply on the first try.
   * Defaults to FUNES_VAULT_SUGGESTED_PURPOSE.
   */
  suggestedPurpose?: string;
};

export function createToolDefinitions(
  api: FunesVaultMcpApi = new FunesVaultApiClient(),
  options: FunesVaultMcpServerOptions = {}
) {
  const suggestedPurpose =
    options.suggestedPurpose ?? process.env.FUNES_VAULT_SUGGESTED_PURPOSE ?? "";
  const purposeHint = suggestedPurpose
    ? ` This client's access policy grants the purpose "${suggestedPurpose}"; pass exactly that purpose unless the user explicitly directs otherwise. Requests under other purposes are denied or wait for the user's approval in the vault.`
    : "";
  // Callers fill the purpose field themselves and policies match purposes
  // exactly, so a mismatch is the most common failure for a freshly
  // connected tool. When the granted purpose is configured and the
  // caller's own purpose finds no policy at all, retry once under the
  // granted purpose rather than surfacing a dead end. Denials for any
  // other reason (category, sensitivity) pass through untouched.
  const deniedForNoPolicy = (response: { denied: Array<{ reason: string }> }) =>
    response.denied.some((entry) => entry.reason === "no_active_policy");

  async function withGrantedPurposeRetry<
    Input extends { purpose: string },
    Output extends { denied: Array<{ reason: string }> }
  >(input: Input, call: (input: Input) => Promise<Output>): Promise<Output> {
    const first = await call(input);
    if (
      !suggestedPurpose ||
      input.purpose === suggestedPurpose ||
      !deniedForNoPolicy(first)
    ) {
      return first;
    }

    return call({ ...input, purpose: suggestedPurpose });
  }

  return [
    {
      name: "request_memory" as const,
      config: {
        title: "Request Memory",
        description:
          "Request a policy-filtered memory bundle from Funes Vault for a declared purpose and task. If approval is needed, use open_consent_review, then get_memory_request with the returned requestId after the user reviews it." +
          purposeHint,
        inputSchema: requestMemoryToolInputSchema,
        outputSchema: memoryRequestBundleResponseSchema
      },
      handler: async (input: unknown) => {
        const parsed = requestMemoryToolInputSchema.parse(input);
        const response = await withGrantedPurposeRetry(parsed, (attempt) =>
          api.requestMemory(attempt)
        );

        return asToolResult(response);
      }
    },
    {
      name: "get_memory_request" as const,
      config: {
        title: "Get Memory Request",
        description:
          "Check an existing request after user review. An approved bundle can be retrieved once within 15 minutes. Changes to memories or permissions require fresh approval. Do not repeatedly poll while awaiting the user.",
        inputSchema: z.object({ requestId: z.string().min(1) }),
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
          "Propose a memory. It queues for review unless an explicit WRITE policy permits immediate saving." +
          purposeHint,
        inputSchema: suggestMemoryToolInputSchema,
        outputSchema: memorySuggestionResponseSchema
      },
      handler: async (input: unknown) => {
        const parsed = suggestMemoryToolInputSchema.parse(input);
        const response = await withGrantedPurposeRetry(parsed, (attempt) =>
          api.suggestMemory(attempt)
        );

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
