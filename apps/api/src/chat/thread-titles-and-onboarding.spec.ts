import {
  chatMessageRequestSchema,
  chatStreamMessageRequestSchema,
  createOnboardingSuggestionsSchema
} from "@funes-vault/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createChatHarness,
  mockedGenerateText,
  readUiStream
} from "../../test/fixtures/chat.js";
afterEach(() => vi.unstubAllEnvs());
describe("privacy: ChatService", () => {
  let memorySuggestionsService: Awaited<
    ReturnType<typeof createChatHarness>
  >["memorySuggestionsService"];
  let prisma: Awaited<ReturnType<typeof createChatHarness>>["prisma"];
  let service: Awaited<ReturnType<typeof createChatHarness>>["service"];
  beforeEach(async () => {
    ({ memorySuggestionsService, prisma, service } = await createChatHarness());
  });

  it("rejects ambiguous sends at the request boundary", () => {
    expect(() =>
      chatMessageRequestSchema.parse({
        sessionId: "session_1",
        startNewThread: true,
        message: "Ambiguous target."
      })
    ).toThrow();
    expect(prisma.client.chatSession.create).not.toHaveBeenCalled();
  });
  it("generates a title for an unlocked early thread", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockedGenerateText
      .mockResolvedValueOnce({
        output: {
          answer: "We can plan that.",
          citedRefs: []
        }
      } as never)
      .mockResolvedValueOnce({
        text: "  Project planning chat  "
      } as never);
    prisma.client.chatSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        title: null,
        _count: { messages: 2 }
      });

    await service.turns.sendMessage({
      userId: "user_1",
      body: chatMessageRequestSchema.parse({
        message: "Help plan the project."
      })
    });

    expect(prisma.client.chatSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: "session_1",
        userId: "user_1",
        titleLocked: false
      },
      data: {
        title: "Project planning chat"
      }
    });
  });
  it("does not overwrite locked titles during automatic title generation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    prisma.client.chatSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await service.turns.sendMessage({
      userId: "user_1",
      body: chatMessageRequestSchema.parse({
        message: "Help plan the project."
      })
    });

    expect(prisma.client.chatSession.updateMany).not.toHaveBeenCalled();
  });
  it("does not regenerate automatic titles after the first two user prompts", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockedGenerateText.mockResolvedValueOnce({
      output: {
        answer: "We can keep going.",
        citedRefs: []
      }
    } as never);
    prisma.client.chatSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        title: "Existing project planning chat",
        _count: { messages: 6 }
      });

    await service.turns.sendMessage({
      userId: "user_1",
      body: chatMessageRequestSchema.parse({
        message: "Third prompt in the same thread."
      })
    });

    expect(mockedGenerateText).toHaveBeenCalledTimes(1);
    expect(prisma.client.chatSession.updateMany).not.toHaveBeenCalled();
  });
  it("normalizes and clips generated titles", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const longTitle = `  ${"A".repeat(120)}  `;
    mockedGenerateText
      .mockResolvedValueOnce({
        output: {
          answer: "We can plan that.",
          citedRefs: []
        }
      } as never)
      .mockResolvedValueOnce({
        text: longTitle
      } as never);
    prisma.client.chatSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        title: null,
        _count: { messages: 2 }
      });

    await service.turns.sendMessage({
      userId: "user_1",
      body: chatMessageRequestSchema.parse({
        message: "Help plan the project."
      })
    });

    const updateCall = prisma.client.chatSession.updateMany.mock.calls[0]?.[0];
    expect(updateCall?.data.title).toHaveLength(80);
    expect(updateCall?.data.title).toMatch(/\.\.\.$/u);
  });
  it("leaves title unchanged when automatic title generation fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockedGenerateText
      .mockResolvedValueOnce({
        output: {
          answer: "We can plan that.",
          citedRefs: []
        }
      } as never)
      .mockRejectedValueOnce(new Error("title provider failed"));
    prisma.client.chatSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        title: null,
        _count: { messages: 2 }
      });

    await service.turns.sendMessage({
      userId: "user_1",
      body: chatMessageRequestSchema.parse({
        message: "Help plan the project."
      })
    });

    expect(prisma.client.chatSession.updateMany).not.toHaveBeenCalled();
  });
  it("streams a draft new-thread send and emits the generated title", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mockedGenerateText.mockResolvedValueOnce({
      text: "Streamed project planning"
    } as never);
    prisma.client.chatSession.findFirst.mockResolvedValueOnce({
      title: null,
      _count: { messages: 2 }
    });

    const stream = await service.turns.streamMessage({
      userId: "user_1",
      body: chatStreamMessageRequestSchema.parse({
        startNewThread: true,
        message: "Please stream a separate thread."
      })
    });
    const chunks = await readUiStream(stream);

    expect(prisma.client.chatSession.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        title: null
      }
    });
    expect(prisma.client.chatSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: "session_1",
        userId: "user_1",
        titleLocked: false
      },
      data: {
        title: "Streamed project planning"
      }
    });
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "data-thread-state",
          data: expect.objectContaining({
            sessionId: "session_1",
            title: "Streamed project planning"
          })
        })
      ])
    );
  });
  it("converts guided answers into user-owned suggestions", async () => {
    const response = await service.interview.createOnboardingSuggestions({
      userId: "user_1",
      body: createOnboardingSuggestionsSchema.parse({
        answers: [
          {
            questionId: "collaboration_style",
            answer: "I like direct implementation when intent is clear."
          }
        ]
      })
    });

    expect(memorySuggestionsService.createUserSuggestion).toHaveBeenCalledWith({
      userId: "user_1",
      body: expect.objectContaining({
        purpose: "guided_onboarding",
        title: "Collaboration preference",
        categoryKeys: ["communication_style"]
      })
    });
    expect(response.suggestions).toEqual([{ id: "suggestion_1" }]);
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
