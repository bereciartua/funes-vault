import { MemorySensitivity } from "@funes-vault/db";
import { generateText, streamText } from "ai";
import { vi } from "vitest";

import { ChatService } from "../../src/chat/chat.service.js";
import { ChatGenerationService } from "../../src/chat/chat-generation.service.js";
import { ChatMemoryToolsService } from "../../src/chat/chat-memory-tools.service.js";
import { ChatThreadsService } from "../../src/chat/chat-threads.service.js";
import { GuidedInterviewService } from "../../src/chat/guided-interview.service.js";
import { ThreadTitleService } from "../../src/chat/thread-title.service.js";
import { ExtractionReconciliationService } from "../../src/memory-processing/extraction-reconciliation.service.js";
import { ExtractionRunService } from "../../src/memory-processing/extraction-run.service.js";
import { SuggestionIntakeService } from "../../src/memory-suggestions/suggestion-intake.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { createTestModule } from "../mocks/create-service.js";
import { mockPrisma } from "../mocks/prisma.js";
export const mockedGenerateText = vi.mocked(generateText);
export const mockedStreamText = vi.mocked(streamText);
function asyncTextStream(chunks: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };
}
export async function readUiStream(stream: ReadableStream<unknown>) {
  const reader = stream.getReader();
  const chunks: unknown[] = [];

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }

    chunks.push(result.value);
  }

  return chunks;
}
export async function createChatHarness() {
  vi.stubEnv("OPENAI_API_KEY", undefined);
  mockedGenerateText.mockReset();
  mockedStreamText.mockReset();
  mockedGenerateText.mockResolvedValue({
    output: {
      answer: "Hello from Funes.",
      citedRefs: []
    }
  } as never);
  mockedStreamText.mockReturnValue({
    textStream: asyncTextStream(["Hello", " from stream."]),
    finishReason: Promise.resolve("stop")
  } as never);
  const chatMemoryTools: {
    requestMemory: ReturnType<typeof vi.fn>;
    suggestMemory: ReturnType<typeof vi.fn>;
  } = {
    requestMemory: vi.fn().mockResolvedValue({
      items: [
        {
          memoryId: "memory_1",
          text: "Prefers concise help: The user prefers concise implementation help.",
          category: "communication_style",
          sensitivity: MemorySensitivity.LOW,
          relevanceScore: 0.91,
          estimatedTokens: 16
        }
      ],
      citations: [
        {
          memoryId: "memory_1",
          title: "Prefers concise help",
          categoryKeys: ["communication_style"],
          sensitivity: MemorySensitivity.LOW,
          relevanceScore: 0.91
        }
      ]
    }),
    suggestMemory: vi.fn().mockResolvedValue({
      suggestionId: "suggestion_1",
      status: "QUEUED_FOR_REVIEW",
      decision: "ALLOW",
      denied: []
    })
  };
  const memorySuggestionsService: {
    createUserSuggestion: ReturnType<typeof vi.fn>;
  } = {
    createUserSuggestion: vi.fn().mockResolvedValue({
      suggestion: { id: "suggestion_1" }
    })
  };
  const prisma = {
    client: mockPrisma({
      chatSession: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({
          id: "session_1",
          userId: "user_1",
          title: null,
          titleLocked: false,
          createdAt: new Date("2026-06-27T14:00:00.000Z"),
          updatedAt: new Date("2026-06-27T14:00:00.000Z")
        }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      chatMessage: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id:
              data.role === "USER"
                ? "chat_message_user"
                : "chat_message_assistant",
            role: data.role,
            content: data.content,
            citations: data.citations ?? [],
            suggestedMemoryIds: data.suggestedMemoryIds ?? [],
            provider: data.provider ?? {},
            createdAt: new Date("2026-06-27T14:00:00.000Z")
          })
        )
      },
      memoryCategory: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: "communication_style",
            name: "Communication style",
            description: "Tone and collaboration preferences"
          }
        ])
      }
    })
  };
  const module = await createTestModule(
    [
      ChatService,
      ChatGenerationService,
      ThreadTitleService,
      ChatThreadsService,
      GuidedInterviewService
    ],
    [
      {
        provide: ExtractionReconciliationService,
        useValue: { recordTool: vi.fn(), complete: vi.fn() }
      },
      { provide: PrismaService, useValue: prisma },
      {
        provide: SuggestionIntakeService,
        useValue: memorySuggestionsService
      },
      { provide: ChatMemoryToolsService, useValue: chatMemoryTools },
      {
        provide: ExtractionRunService,
        useValue: {
          recordTool: vi.fn(),
          process: vi
            .fn()
            .mockResolvedValue({ status: "completed", outcomes: [] }),
          result: vi
            .fn()
            .mockResolvedValue({ status: "completed", outcomes: [] })
        }
      }
    ]
  );
  const service = {
    turns: module.get(ChatService),
    threads: module.get(ChatThreadsService),
    interview: module.get(GuidedInterviewService)
  };

  return { chatMemoryTools, memorySuggestionsService, prisma, service };
}
