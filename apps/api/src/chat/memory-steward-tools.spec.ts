import { describe, expect, it, vi } from "vitest";

import { interviewGuidanceText } from "./guided-interview.js";
import {
  buildMemoryStewardSystemPrompt,
  currentDateForPrompt
} from "./steward-prompt.js";
import { type StewardToolEvent } from "./steward-tool.types.js";
import { createStewardToolRunState } from "./steward-tool-state.js";
import {
  findStewardTool,
  memoryStewardToolDefinitions,
  realtimeToolSchemas
} from "./steward-tools.js";

const categories = [
  {
    key: "communication_style",
    name: "Communication Style",
    description: "Tone and format preferences."
  }
];

function createContext(overrides: Record<string, unknown> = {}) {
  const events: StewardToolEvent[] = [];

  return {
    events,
    context: {
      userId: "user_1",
      channel: "voice" as const,
      categories,
      chatMemoryTools: {
        requestMemory: vi.fn().mockResolvedValue({
          requestId: "request_1",
          status: "FULFILLED",
          policyId: "policy_1",
          tokenBudget: 800,
          estimatedTokens: 20,
          items: [
            {
              memoryId: "memory_1",
              text: "Prefers concise help.",
              category: "communication_style",
              sensitivity: "LOW",
              relevanceScore: 0.9,
              estimatedTokens: 10
            }
          ],
          citations: [
            {
              memoryId: "memory_1",
              title: "Prefers concise help",
              categoryKeys: ["communication_style"],
              sensitivity: "LOW",
              relevanceScore: 0.9
            }
          ],
          denied: [],
          auditEventId: "audit_1"
        }),
        suggestMemory: vi.fn().mockResolvedValue({
          suggestionId: "suggestion_1",
          memoryId: null,
          status: "QUEUED_FOR_REVIEW",
          policyId: "policy_1",
          auditEventId: "audit_2",
          decision: "NEEDS_CONFIRMATION",
          denied: []
        })
      },
      state: createStewardToolRunState(),
      emit: (event: StewardToolEvent) => {
        events.push(event);
      },
      ...overrides
    }
  };
}

describe("privacy: memory steward tool module", () => {
  it("is the single source for chat and voice tool names", () => {
    const names = memoryStewardToolDefinitions.map(
      (definition) => definition.name
    );

    expect(names).toEqual([
      "list_memory_categories",
      "request_memory",
      "search_memories",
      "update_memory",
      "archive_memory",
      "list_queued_memory_suggestions",
      "reject_memory_suggestion",
      "complete_memory_capture",
      "memory_capture_result"
    ]);
    expect(findStewardTool("suggest_memory")).toBeNull();
    expect(findStewardTool("unknown_tool")).toBeNull();
  });

  it("derives Realtime function schemas from the same zod definitions", () => {
    const schemas = realtimeToolSchemas();

    expect(schemas.map((schema) => schema.name)).toEqual(
      memoryStewardToolDefinitions.map((definition) => definition.name)
    );

    for (const schema of schemas) {
      expect(schema.type).toBe("function");
      expect(schema.description.length).toBeGreaterThan(0);
      expect((schema.parameters as { type?: string }).type).toBe("object");
    }

    const suggestSchema = schemas.find(
      (schema) => schema.name === "memory_capture_result"
    );
    const properties = (
      suggestSchema?.parameters as {
        properties?: Record<string, unknown>;
      }
    ).properties;
    expect(Object.keys(properties ?? {})).toEqual([]);
  });

  it("assigns citation refs and emits the same event sequence for voice as chat", async () => {
    const { context, events } = createContext();
    const definition = findStewardTool("request_memory")!;

    const output = (await definition.execute(
      context as never,
      {
        task: "communication preferences",
        requestedCategories: [],
        tokenBudget: 800
      },
      "call_1"
    )) as { items: Array<{ ref: string | null }> };

    expect(output.items[0]?.ref).toBe("[1]");
    expect(context.state.toolCitations).toHaveLength(1);
    expect(events.map((event) => event.type)).toEqual([
      "tool-trace",
      "policy-decision",
      "memory-citation",
      "audit-event",
      "tool-trace"
    ]);
    expect(context.chatMemoryTools.requestMemory).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "voice" })
    );
  });

  it("returns only the durable result bound to the source turn", async () => {
    const result = vi.fn().mockResolvedValue({
      status: "completed",
      outcomes: [{ status: "APPLIED", memoryId: "memory_1" }]
    });
    const { context } = createContext({
      sourceMessageId: "source_1",
      runs: { result }
    });
    const definition = findStewardTool("memory_capture_result")!;
    expect(await definition.execute(context as never, {}, "call_1")).toEqual(
      await definition.execute(context as never, {}, "call_2")
    );
    expect(result).toHaveBeenCalledWith("user_1", "source_1");
    await expect(
      definition.execute(
        context as never,
        { title: "injected", body: "arbitrary" },
        "call_3"
      )
    ).rejects.toThrow();
    expect(context.chatMemoryTools.suggestMemory).not.toHaveBeenCalled();
  });
  it("returns pending for tool events arriving before the transcript", async () => {
    const { context } = createContext();
    expect(
      await findStewardTool("memory_capture_result")!.execute(
        context as never,
        {},
        "early"
      )
    ).toEqual({ status: "pending" });
  });
});

describe("privacy: memory steward prompt variants", () => {
  const base = {
    categories,
    interviewGuidance: interviewGuidanceText(),
    currentDate: "2026-07-04"
  };

  it("keeps bracket citations in the chat variant", () => {
    const prompt = buildMemoryStewardSystemPrompt({
      ...base,
      channel: "chat"
    });

    expect(prompt).toContain("with their provided bracket labels like [1]");
    expect(prompt).toContain(
      "Only claim a save or review queue when the authoritative result confirms it"
    );
    expect(prompt).not.toContain("realtime voice conversation");
  });

  it("speaks short answers without bracket citations in the voice variant", () => {
    const prompt = buildMemoryStewardSystemPrompt({
      ...base,
      channel: "voice"
    });

    expect(prompt).toContain("realtime voice conversation");
    expect(prompt).toContain("about two sentences by default");
    expect(prompt).toContain("Never read bracket labels such as [1] aloud");
    expect(prompt).not.toContain("with their provided bracket labels like [1]");
    // Suggestion discipline is unchanged in the voice variant.
    expect(prompt).toContain("Memory extraction runs on the server");
    expect(prompt).toContain("reconcile existing state before creating");
  });
});

it("uses the request timezone for the steward date, defaulting to UTC", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-09-22T00:30:00Z"));
    expect(currentDateForPrompt("America/Los_Angeles")).toBe("2026-09-21");
    expect(currentDateForPrompt("Asia/Tokyo")).toBe("2026-09-22");
    expect(currentDateForPrompt()).toBe("2026-09-22");
  } finally {
    vi.useRealTimers();
  }
});

it.each(["no_client_policy", "operation_not_allowed", "no_matching_memories"])(
  "explains %s in the tool result, trace and policy event",
  async (reason) => {
    const { events, context } = createContext();
    context.chatMemoryTools.requestMemory.mockResolvedValue({
      requestId: "request",
      status: "DENIED",
      reason,
      policyId: null,
      tokenBudget: 800,
      estimatedTokens: 0,
      items: [],
      citations: [],
      denied: [],
      auditEventId: "audit"
    });
    const response = await findStewardTool("request_memory")!.execute(
      context as unknown as Parameters<
        NonNullable<ReturnType<typeof findStewardTool>>["execute"]
      >[0],
      { task: "color", tokenBudget: 800, requestedCategories: [] },
      "call"
    );
    expect(response).toMatchObject({
      reason,
      explanation: expect.any(String)
    });
    if (reason === "no_client_policy") {
      expect(response).toHaveProperty(
        "managePermissionsUrl",
        "/settings/clients"
      );
    }
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "policy-decision",
        data: expect.objectContaining({ reasons: [reason] })
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool-trace",
        data: expect.objectContaining({
          summary: expect.not.stringContaining(reason)
        })
      })
    );
  }
);
