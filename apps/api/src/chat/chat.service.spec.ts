import { MemorySensitivity } from "@funes-vault/db";
import {
  chatMessageRequestSchema,
  chatStreamMessageRequestSchema
} from "@funes-vault/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createChatHarness,
  mockedGenerateText,
  mockedStreamText,
  readUiStream
} from "../../test/fixtures/chat.js";
afterEach(() => vi.unstubAllEnvs());
describe("privacy: ChatService", () => {
  let chatMemoryTools: Awaited<
    ReturnType<typeof createChatHarness>
  >["chatMemoryTools"];
  let prisma: Awaited<ReturnType<typeof createChatHarness>>["prisma"];
  let service: Awaited<ReturnType<typeof createChatHarness>>["service"];
  beforeEach(async () => {
    ({ chatMemoryTools, prisma, service } = await createChatHarness());
  });

  it("rejects chat turns when no model provider is configured", async () => {
    await expect(
      service.turns.sendMessage({
        userId: "user_1",
        body: chatMessageRequestSchema.parse({
          message: "What do you know about my work style?"
        })
      })
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({
        message: "Memory chat requires a configured OpenAI model provider."
      })
    });

    expect(prisma.client.chatSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.client.chatMessage.create).not.toHaveBeenCalled();
  });
  it("does not use local retrieval or suggestion fallbacks without a provider", async () => {
    await expect(
      service.turns.sendMessage({
        userId: "user_1",
        body: chatMessageRequestSchema.parse({
          message: "I prefer dogs over cats"
        })
      })
    ).rejects.toMatchObject({
      status: 503
    });

    expect(chatMemoryTools.requestMemory).not.toHaveBeenCalled();
  });
  it("does not use regex fallbacks for misspelled remember requests", async () => {
    await expect(
      service.turns.sendMessage({
        userId: "user_1",
        body: chatMessageRequestSchema.parse({
          message: "Can you please remeber that I like Cheesecake?"
        })
      })
    ).rejects.toMatchObject({
      status: 503
    });
  });
  it("does not retrieve or cite memories for ordinary small talk without a provider", async () => {
    await expect(
      service.turns.sendMessage({
        userId: "user_1",
        body: chatMessageRequestSchema.parse({
          message: "Say hello in one short sentence."
        })
      })
    ).rejects.toMatchObject({
      status: 503
    });

    expect(chatMemoryTools.requestMemory).not.toHaveBeenCalled();
  });
  it("rejects streamed chat turns when no model provider is configured", async () => {
    await expect(
      service.turns.streamMessage({
        userId: "user_1",
        body: chatStreamMessageRequestSchema.parse({
          message: "Stream this answer."
        })
      })
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({
        message: "Memory chat requires a configured OpenAI model provider."
      })
    });

    expect(mockedStreamText).not.toHaveBeenCalled();
    expect(prisma.client.chatSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.client.chatMessage.create).not.toHaveBeenCalled();
  });
  it("uses the configured model provider instead of a local fallback", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const response = await service.turns.sendMessage({
      userId: "user_1",
      body: chatMessageRequestSchema.parse({
        message: "What do you know about my work style?"
      })
    });

    expect(mockedGenerateText).toHaveBeenCalled();
    expect(prisma.client.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "session_1",
        userId: "user_1",
        role: "USER",
        content: "What do you know about my work style?"
      })
    });
    expect(response.sessionId).toBe("session_1");
    expect(response.answer).toBe("Hello from Funes.");
    expect(response.citations).toEqual([]);
    expect(response.provider).toEqual(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-5.5",
        usesThirdParty: true
      })
    );
  });
  it("returns every compiled memory bundle item to the model-facing tool", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const bundleItems = Array.from({ length: 10 }, (_, index) => ({
      memoryId: `memory_${index + 1}`,
      text: `Memory ${index + 1}: useful context`,
      category: "communication_style",
      sensitivity: MemorySensitivity.LOW,
      relevanceScore: 0.9 - index * 0.01,
      estimatedTokens: 5
    }));
    const citations = bundleItems.map((item, index) => ({
      memoryId: item.memoryId,
      title: `Memory ${index + 1}`,
      categoryKeys: ["communication_style"],
      sensitivity: MemorySensitivity.LOW,
      relevanceScore: item.relevanceScore
    }));
    const toolResult: {
      current: { items: Array<{ memoryId: string }> } | null;
    } = { current: null };

    chatMemoryTools.requestMemory.mockResolvedValueOnce({
      requestId: "request_1",
      status: "FULFILLED",
      policyId: "policy_1",
      tokenBudget: 800,
      estimatedTokens: 50,
      items: bundleItems,
      citations,
      denied: [],
      auditEventId: "audit_1"
    });
    mockedGenerateText.mockImplementationOnce(async (input) => {
      const requestMemoryTool = (
        input as unknown as {
          tools: {
            request_memory: {
              execute: (
                input: {
                  task: string;
                  requestedCategories: string[];
                  tokenBudget: number;
                },
                options: { toolCallId: string }
              ) => Promise<{ items: Array<{ memoryId: string }> }>;
            };
          };
        }
      ).tools.request_memory;

      toolResult.current = await requestMemoryTool.execute(
        {
          task: "Find stored memory context.",
          requestedCategories: ["communication_style"],
          tokenBudget: 800
        },
        { toolCallId: "tool_1" }
      );

      return {
        output: {
          answer: "I found the later memory [10].",
          citedRefs: [10]
        }
      } as never;
    });

    const response = await service.turns.sendMessage({
      userId: "user_1",
      body: chatMessageRequestSchema.parse({ message: "What do you remember?" })
    });

    expect(toolResult.current?.items).toHaveLength(10);
    expect(response.citations).toEqual([citations[9]]);
  });
  it("streams, persists, and scopes chat turns to the current user session", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    prisma.client.chatSession.findFirst
      .mockResolvedValueOnce({
        id: "session_from_request",
        userId: "user_1",
        title: null,
        titleLocked: false,
        createdAt: new Date("2026-06-27T14:00:00.000Z"),
        updatedAt: new Date("2026-06-27T14:00:00.000Z")
      })
      .mockResolvedValueOnce(null);

    const stream = await service.turns.streamMessage({
      userId: "user_1",
      body: chatStreamMessageRequestSchema.parse({
        sessionId: "session_from_request",
        message: "Please stream a short answer."
      })
    });
    const chunks = await readUiStream(stream);

    expect(prisma.client.chatSession.findFirst).toHaveBeenCalledWith({
      where: { id: "session_from_request", userId: "user_1" }
    });
    expect(mockedStreamText).toHaveBeenCalled();
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "data-thread-state",
          data: expect.objectContaining({ sessionId: "session_from_request" })
        }),
        expect.objectContaining({ type: "text-delta", delta: "Hello" }),
        expect.objectContaining({ type: "finish" })
      ])
    );
    expect(prisma.client.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "session_from_request",
        userId: "user_1",
        role: "USER",
        content: "Please stream a short answer."
      })
    });
    expect(prisma.client.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "session_from_request",
        userId: "user_1",
        role: "ASSISTANT",
        content: "Hello from stream."
      })
    });
  });
});

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();

  return {
    ...actual,
    generateText: vi.fn(),
    streamText: vi.fn()
  };
});
