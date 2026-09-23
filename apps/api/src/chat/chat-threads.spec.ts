import {
  chatMessageRequestSchema,
  listChatThreadsQuerySchema,
  renameChatThreadRequestSchema
} from "@funes-vault/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChatHarness } from "../../test/fixtures/chat.js";
afterEach(() => vi.unstubAllEnvs());
describe("privacy: ChatService", () => {
  let prisma: Awaited<ReturnType<typeof createChatHarness>>["prisma"];
  let service: Awaited<ReturnType<typeof createChatHarness>>["service"];
  beforeEach(async () => {
    ({ prisma, service } = await createChatHarness());
  });

  it("loads the persisted current chat session", async () => {
    prisma.client.chatSession.findFirst.mockResolvedValueOnce({
      id: "session_1",
      userId: "user_1",
      title: null,
      titleLocked: false,
      createdAt: new Date("2026-06-27T14:00:00.000Z"),
      updatedAt: new Date("2026-06-27T14:00:00.000Z")
    });
    prisma.client.chatMessage.findMany.mockResolvedValueOnce([
      {
        id: "message_1",
        role: "ASSISTANT",
        content: "Hello from the vault.",
        citations: [],
        suggestedMemoryIds: [],
        provider: {},
        createdAt: new Date("2026-06-27T14:00:00.000Z")
      }
    ]);

    const response = await service.threads.getCurrentSession({
      userId: "user_1"
    });

    expect(response.sessionId).toBe("session_1");
    expect(response.title).toBeNull();
    expect(response.titleLocked).toBe(false);
    expect(response.messages).toEqual([
      expect.objectContaining({
        id: "message_1",
        role: "assistant",
        content: "Hello from the vault."
      })
    ]);
  });
  it("starts a fresh chat thread without loading previous messages", async () => {
    prisma.client.chatSession.create.mockResolvedValueOnce({
      id: "session_2",
      userId: "user_1",
      title: null,
      titleLocked: false,
      createdAt: new Date("2026-06-27T14:05:00.000Z"),
      updatedAt: new Date("2026-06-27T14:05:00.000Z")
    });

    const response = await service.threads.startThread({ userId: "user_1" });

    expect(prisma.client.chatSession.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        title: null
      }
    });
    expect(prisma.client.chatMessage.findMany).not.toHaveBeenCalled();
    expect(response).toEqual({
      sessionId: "session_2",
      title: null,
      titleLocked: false,
      messages: []
    });
  });
  it("lists only non-empty current-user threads with default pagination", async () => {
    prisma.client.chatSession.count.mockResolvedValueOnce(12);
    prisma.client.chatSession.findMany.mockResolvedValueOnce([
      {
        id: "session_12",
        userId: "user_1",
        title: "Thread title",
        titleLocked: false,
        createdAt: new Date("2026-06-27T14:00:00.000Z"),
        updatedAt: new Date("2026-06-27T15:00:00.000Z"),
        _count: { messages: 3 },
        messages: [{ content: "Last message in the thread." }]
      }
    ]);

    const response = await service.threads.listThreads({
      userId: "user_1",
      query: listChatThreadsQuerySchema.parse({})
    });

    expect(prisma.client.chatSession.count).toHaveBeenCalledWith({
      where: { userId: "user_1", messages: { some: {} } }
    });
    expect(prisma.client.chatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", messages: { some: {} } },
        orderBy: { updatedAt: "desc" },
        skip: 0,
        take: 10
      })
    );
    expect(response.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 12,
      totalPages: 2
    });
    expect(response.items).toEqual([
      expect.objectContaining({
        sessionId: "session_12",
        title: "Thread title",
        messageCount: 3,
        lastMessagePreview: "Last message in the thread."
      })
    ]);
  });
  it("clamps out-of-range thread pages", async () => {
    prisma.client.chatSession.count.mockResolvedValueOnce(12);
    prisma.client.chatSession.findMany.mockResolvedValueOnce([]);

    const response = await service.threads.listThreads({
      userId: "user_1",
      query: listChatThreadsQuerySchema.parse({ page: "99", limit: "10" })
    });

    expect(prisma.client.chatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10
      })
    );
    expect(response.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 12,
      totalPages: 2
    });
  });
  it("loads a selected current-user thread", async () => {
    prisma.client.chatSession.findFirst.mockResolvedValueOnce({
      id: "session_1",
      userId: "user_1",
      title: "Selected thread",
      titleLocked: true,
      createdAt: new Date("2026-06-27T14:00:00.000Z"),
      updatedAt: new Date("2026-06-27T14:00:00.000Z")
    });
    prisma.client.chatMessage.findMany.mockResolvedValueOnce([
      {
        id: "message_1",
        role: "USER",
        content: "Hello",
        citations: [],
        suggestedMemoryIds: [],
        provider: {},
        createdAt: new Date("2026-06-27T14:00:00.000Z")
      }
    ]);

    const response = await service.threads.getThread({
      userId: "user_1",
      sessionId: "session_1"
    });

    expect(prisma.client.chatSession.findFirst).toHaveBeenCalledWith({
      where: { id: "session_1", userId: "user_1" }
    });
    expect(response).toEqual({
      sessionId: "session_1",
      title: "Selected thread",
      titleLocked: true,
      messages: [
        expect.objectContaining({
          id: "message_1",
          role: "user",
          content: "Hello"
        })
      ]
    });
  });
  it("does not disclose another user's thread", async () => {
    prisma.client.chatSession.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.threads.getThread({
        userId: "user_1",
        sessionId: "session_other"
      })
    ).rejects.toMatchObject({
      status: 404
    });

    expect(prisma.client.chatMessage.findMany).not.toHaveBeenCalled();
  });
  it("renames a thread and locks the title", async () => {
    prisma.client.chatSession.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.client.chatSession.findFirst.mockResolvedValueOnce({
      id: "session_1",
      userId: "user_1",
      title: "Planning conversations",
      titleLocked: true,
      createdAt: new Date("2026-06-27T14:00:00.000Z"),
      updatedAt: new Date("2026-06-27T14:05:00.000Z"),
      _count: { messages: 2 },
      messages: [{ content: "The last message." }]
    });

    const response = await service.threads.renameThread({
      userId: "user_1",
      sessionId: "session_1",
      body: renameChatThreadRequestSchema.parse({
        title: "  Planning conversations  "
      })
    });

    expect(prisma.client.chatSession.updateMany).toHaveBeenCalledWith({
      where: { id: "session_1", userId: "user_1" },
      data: {
        title: "Planning conversations",
        titleLocked: true
      }
    });
    expect(response.titleLocked).toBe(true);
    expect(response.title).toBe("Planning conversations");
  });
  it("returns a draft-compatible current session when no conversation exists", async () => {
    prisma.client.chatSession.findFirst.mockResolvedValueOnce(null);

    const response = await service.threads.getCurrentSession({
      userId: "user_1"
    });

    expect(prisma.client.chatSession.create).not.toHaveBeenCalled();
    expect(response).toEqual({
      sessionId: null,
      title: null,
      titleLocked: false,
      messages: []
    });
  });
  it("creates a fresh session for startNewThread sends instead of appending to latest", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const response = await service.turns.sendMessage({
      userId: "user_1",
      body: chatMessageRequestSchema.parse({
        startNewThread: true,
        message: "Start a separate thread."
      })
    });

    expect(prisma.client.chatSession.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        title: null
      }
    });
    expect(prisma.client.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "session_1",
        userId: "user_1",
        role: "USER",
        content: "Start a separate thread."
      })
    });
    expect(response.sessionId).toBe("session_1");
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
