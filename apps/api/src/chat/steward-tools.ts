import { AuditEventType } from "@funes-vault/db";
import { MemoryRequestStatus } from "@funes-vault/db";
import type { FunesDataParts } from "@funes-vault/shared";
import { zodSchema } from "ai";
import { z } from "zod";

import { reconciliationTools } from "../memory-processing/reconciliation-tools.js";
import {
  archiveMemoryInputSchema,
  completeMemoryCaptureInputSchema,
  listQueuedSuggestionsInputSchema,
  rejectSuggestionInputSchema,
  requestMemoryInputSchema,
  searchMemoriesInputSchema,
  updateMemoryInputSchema
} from "./steward-tool.schemas.js";
import { StewardToolDefinition } from "./steward-tool.types.js";

function policyDecisionForMemoryRequestStatus(
  status: string
): FunesDataParts["policy-decision"]["decision"] {
  if (status === MemoryRequestStatus.FULFILLED) {
    return "ALLOW";
  }

  if (status === MemoryRequestStatus.NEEDS_USER_APPROVAL) {
    return "REQUIRE_CONFIRMATION";
  }

  return "DENY";
}

export const memoryStewardToolDefinitions: StewardToolDefinition[] = [
  {
    name: "list_memory_categories",
    description:
      "List the existing memory category keys that may be used in suggest_memory. Use this before suggesting a memory if the right category is unclear or after a category validation error.",
    inputSchema: z.object({}),
    execute: (context, _input, toolCallId) => {
      context.emit({
        type: "tool-trace",
        data: {
          toolCallId,
          toolName: "list_memory_categories",
          label: "Category lookup",
          status: "completed",
          summary: `${context.categories.length} memory categories available.`,
          metadata: { count: context.categories.length }
        }
      });

      return Promise.resolve({ items: context.categories });
    }
  },
  {
    name: "request_memory",
    description:
      "Search the user's approved memory vault through the same policy-filtered bundle request path used by external clients. Use only when existing memory context is relevant.",
    inputSchema: requestMemoryInputSchema,
    execute: async (context, rawInput, toolCallId) => {
      const { task, requestedCategories, tokenBudget } =
        requestMemoryInputSchema.parse(rawInput);

      context.emit({
        type: "tool-trace",
        data: {
          toolCallId,
          toolName: "request_memory",
          label: "Memory retrieval",
          status: "running",
          summary: "Requesting policy-filtered vault context.",
          metadata: {
            task,
            requestedCategories,
            tokenBudget
          }
        }
      });
      const bundle = await context.chatMemoryTools.requestMemory({
        userId: context.userId,
        channel: context.channel,
        task,
        requestedCategories,
        tokenBudget
      });
      const decision = policyDecisionForMemoryRequestStatus(bundle.status);

      context.emit({
        type: "policy-decision",
        data: {
          operation: "READ",
          decision,
          clientId: null,
          policyId: bundle.policyId,
          reasons:
            bundle.denied.length > 0
              ? bundle.denied.map((denied) => denied.reason)
              : []
        }
      });

      const items = bundle.items.map((item) => {
        let citationIndex = context.state.citationIndexByMemoryId.get(
          item.memoryId
        );

        if (!citationIndex) {
          const citation = bundle.citations.find(
            (candidate) => candidate.memoryId === item.memoryId
          );

          if (citation) {
            context.state.toolCitations.push(citation);
            citationIndex = context.state.toolCitations.length;
            context.state.citationIndexByMemoryId.set(
              item.memoryId,
              citationIndex
            );
            context.emit({
              type: "memory-citation",
              data: {
                ...citation,
                ref: `[${citationIndex}]`
              }
            });
          }
        }

        return {
          ref: citationIndex ? `[${citationIndex}]` : null,
          memoryId: item.memoryId,
          text: item.text,
          category: item.category,
          sensitivity: item.sensitivity,
          relevanceScore: item.relevanceScore
        };
      });

      if (bundle.auditEventId) {
        context.emit({
          type: "audit-event",
          data: {
            auditEventId: bundle.auditEventId,
            type:
              bundle.status === "DENIED"
                ? AuditEventType.MEMORY_REQUEST_DENIED
                : AuditEventType.MEMORY_DISCLOSURE,
            severity: bundle.items.length > 0 ? "RISK" : "INFO"
          }
        });
      }

      context.emit({
        type: "tool-trace",
        data: {
          toolCallId,
          toolName: "request_memory",
          label: "Memory retrieval",
          status: decision === "DENY" ? "denied" : "completed",
          summary:
            decision === "DENY"
              ? bundle.reason === "no_matching_memories"
                ? "No matching memories were found."
                : bundle.reason === "no_client_policy"
                  ? "This app has no permissions. Set them up in [Apps & access](/settings/clients)."
                  : `Memory retrieval denied: ${bundle.reason ?? "no_allowed_memories"}.`
              : `${items.length} memory references returned.`,
          metadata: {
            requestId: bundle.requestId,
            status: bundle.status,
            policyId: bundle.policyId,
            reason: bundle.reason,
            tokenBudget: bundle.tokenBudget,
            estimatedTokens: bundle.estimatedTokens,
            deniedCount: bundle.denied.length,
            returnedCount: items.length
          }
        }
      });

      return { items, reason: bundle.reason };
    }
  },
  {
    name: "search_memories",
    reconciliation: reconciliationTools.search_memories,
    description:
      "Search the user's active memories by title/body before correcting, updating, archiving, or checking for contradictions. Use this for memory maintenance, not for citations.",
    inputSchema: searchMemoriesInputSchema,
    execute: async (context, rawInput, toolCallId) => {
      const { query, categoryKeys, limit } =
        searchMemoriesInputSchema.parse(rawInput);
      const response = await context.chatMemoryTools.searchMemories({
        userId: context.userId,
        query,
        categoryKeys,
        limit
      });

      context.emit({
        type: "tool-trace",
        data: {
          toolCallId,
          toolName: "search_memories",
          label: "Maintenance search",
          status: "completed",
          summary: `${response.items.length} active memories matched.`,
          metadata: {
            query,
            categoryKeys,
            count: response.items.length
          }
        }
      });

      return response;
    }
  },
  {
    name: "update_memory",
    reconciliation: reconciliationTools.update_memory,
    description:
      "Directly update an active memory owned by the current user when the user explicitly corrects or changes a stored fact/preference. Prefer this over creating a contradictory new memory.",
    inputSchema: updateMemoryInputSchema,
    execute: async (context, rawInput, toolCallId) => {
      const input = updateMemoryInputSchema.parse(rawInput);
      const response = await context.chatMemoryTools.updateMemory({
        userId: context.userId,
        memoryId: input.memoryId,
        title: input.title,
        body: input.body,
        kind: input.kind,
        sensitivity: input.sensitivity,
        categoryKeys: input.categoryKeys,
        confidence: input.confidence
      });

      context.emit({
        type: "tool-trace",
        data: {
          toolCallId,
          toolName: "update_memory",
          label: "Memory update",
          status: "completed",
          summary: `Updated memory ${input.memoryId}.`,
          metadata: {
            memoryId: input.memoryId,
            categoryKeys: input.categoryKeys,
            sensitivity: input.sensitivity
          }
        }
      });

      return response;
    }
  },
  {
    name: "archive_memory",
    reconciliation: reconciliationTools.archive_memory,
    description:
      "Archive an active memory owned by the current user when it is contradicted, superseded, or duplicated by a correction. Use this rather than leaving conflicting active memories.",
    inputSchema: archiveMemoryInputSchema,
    execute: async (context, rawInput, toolCallId) => {
      const { memoryId, reason } = archiveMemoryInputSchema.parse(rawInput);
      const response = await context.chatMemoryTools.archiveMemory({
        userId: context.userId,
        memoryId,
        reason
      });

      context.emit({
        type: "tool-trace",
        data: {
          toolCallId,
          toolName: "archive_memory",
          label: "Memory archive",
          status: "completed",
          summary: `Archived memory ${memoryId}.`,
          metadata: { memoryId, reason }
        }
      });

      return response;
    }
  },
  {
    name: "list_queued_memory_suggestions",
    reconciliation: reconciliationTools.list_queued_memory_suggestions,
    description:
      "List queued memory suggestions, optionally filtered by subject, before creating or correcting suggestions. Use this to avoid contradictory pending suggestions.",
    inputSchema: listQueuedSuggestionsInputSchema,
    execute: async (context, rawInput, toolCallId) => {
      const { query, limit } = listQueuedSuggestionsInputSchema.parse(rawInput);
      const response = await context.chatMemoryTools.listQueuedSuggestions({
        userId: context.userId,
        query,
        limit
      });

      context.emit({
        type: "tool-trace",
        data: {
          toolCallId,
          toolName: "list_queued_memory_suggestions",
          label: "Suggestion queue lookup",
          status: "completed",
          summary: `${response.items.length} queued suggestions matched.`,
          metadata: {
            query,
            count: response.items.length
          }
        }
      });

      return response;
    }
  },
  {
    name: "reject_memory_suggestion",
    reconciliation: reconciliationTools.reject_memory_suggestion,
    description:
      "Reject a queued memory suggestion that the user has contradicted, retracted, or superseded.",
    inputSchema: rejectSuggestionInputSchema,
    execute: async (context, rawInput, toolCallId) => {
      const { suggestionId } = rejectSuggestionInputSchema.parse(rawInput);
      const response = await context.chatMemoryTools.rejectSuggestion({
        userId: context.userId,
        suggestionId
      });

      context.emit({
        type: "tool-trace",
        data: {
          toolCallId,
          toolName: "reject_memory_suggestion",
          label: "Suggestion rejection",
          status: "completed",
          summary: `Rejected queued suggestion ${suggestionId}.`,
          metadata: { suggestionId }
        }
      });

      return response;
    }
  },
  {
    name: "complete_memory_capture",
    description:
      "Finish reconciliation for a server-issued candidate after searching active memories and queued suggestions and updating, archiving or rejecting obsolete matches. Create is allowed only if both searches found no match; defer requests clarification.",
    inputSchema: completeMemoryCaptureInputSchema,
    execute: async (context, rawInput) => {
      const input = completeMemoryCaptureInputSchema.parse(rawInput);

      return context.reconciliation && context.sourceMessageId
        ? context.reconciliation.complete(
            context.userId,
            context.sourceMessageId,
            input.candidateId,
            input.resolution
          )
        : { status: "pending" };
    }
  },
  {
    name: "memory_capture_result",
    description:
      "Read the server-owned extraction result for this source turn. Cannot create arbitrary memories. Pending means no save has been confirmed.",
    inputSchema: z.object({}).strict(),
    execute: async (context, rawInput) => {
      z.object({}).strict().parse(rawInput);

      return context.runs && context.sourceMessageId
        ? context.runs.result(context.userId, context.sourceMessageId)
        : { status: "pending" };
    }
  }
];

export function findStewardTool(name: string) {
  return (
    memoryStewardToolDefinitions.find(
      (definition) => definition.name === name
    ) ?? null
  );
}

export function realtimeToolSchemas() {
  return memoryStewardToolDefinitions.map((definition) => ({
    type: "function" as const,
    name: definition.name,
    description: definition.description,
    parameters: zodSchema(definition.inputSchema).jsonSchema
  }));
}
