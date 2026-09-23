import { vi } from "vitest";

import { ChatService } from "../../src/chat/chat.service.js";
import { ChatMemoryToolsService } from "../../src/chat/chat-memory-tools.service.js";
import { FirstPartyAccessService } from "../../src/first-party-access/first-party-access.service.js";
import { ExtractionReconciliationService } from "../../src/memory-processing/extraction-reconciliation.service.js";
import { ExtractionRunService } from "../../src/memory-processing/extraction-run.service.js";
import { MemoryProcessingConfigService } from "../../src/memory-processing/memory-processing-config.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { RealtimeClientService } from "../../src/voice/realtime-client.service.js";
import { VoiceSessionsService } from "../../src/voice/voice-sessions.service.js";
import { createService as resolveService } from "../mocks/create-service.js";
import { mockPrisma } from "../mocks/prisma.js";
export const now = new Date("2026-07-04T12:00:00.000Z");
export function createPrismaMock() {
  return {
    client: mockPrisma({
      voiceSession: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({
          id: "voice_1",
          userId: "user_1",
          chatSessionId: "session_1",
          model: "gpt-realtime-2",
          startedAt: now,
          endedAt: null,
          endReason: null
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: "voice_1",
          userId: "user_1",
          chatSessionId: "session_1",
          model: "gpt-realtime-2",
          startedAt: new Date(),
          endedAt: null,
          endReason: null
        }),
        update: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: "voice_1",
            userId: "user_1",
            chatSessionId: "session_1",
            model: "gpt-realtime-2",
            startedAt: now,
            endedAt: data.endedAt ?? null,
            endReason: data.endReason ?? null
          })
        )
      },
      chatSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: "session_1",
          userId: "user_1",
          title: "Existing thread",
          titleLocked: false
        }),
        create: vi.fn().mockResolvedValue({
          id: "session_new",
          userId: "user_1",
          title: null,
          titleLocked: false
        })
      },
      memoryCategory: {
        findMany: vi.fn().mockResolvedValue([
          {
            key: "communication_style",
            name: "Communication Style",
            description: null
          }
        ])
      }
    })
  };
}
export async function createService(
  overrides: {
    prisma?: ReturnType<typeof createPrismaMock>;
    chatService?: Record<string, ReturnType<typeof vi.fn>>;
    chatMemoryTools?: Record<string, ReturnType<typeof vi.fn>>;
    firstPartyAccess?: Record<string, ReturnType<typeof vi.fn>>;
  } = {}
) {
  const prisma = overrides.prisma ?? createPrismaMock();
  const chatService = overrides.chatService ?? {
    persistVoiceTurn: vi.fn().mockResolvedValue({
      message: {
        id: "message_1",
        role: "assistant",
        content: "Saved.",
        citations: [],
        suggestedMemoryIds: [],
        createdAt: now.toISOString()
      },
      title: null
    })
  };
  const chatMemoryTools = overrides.chatMemoryTools ?? {
    requestMemory: vi.fn().mockResolvedValue({
      requestId: "request_1",
      status: "FULFILLED",
      policyId: "policy_voice",
      tokenBudget: 800,
      estimatedTokens: 40,
      items: [
        {
          memoryId: "memory_1",
          text: "Prefers concise help.",
          category: "communication_style",
          sensitivity: "LOW",
          relevanceScore: 0.9,
          estimatedTokens: 12
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
    })
  };
  const firstPartyAccess = overrides.firstPartyAccess ?? {
    ensureVoiceAccess: vi
      .fn()
      .mockResolvedValue({ clientId: "voice_client", policyId: "policy_voice" })
  };
  const service = await resolveService(
    VoiceSessionsService,
    [
      {
        provide: ExtractionReconciliationService,
        useValue: { recordTool: vi.fn(), complete: vi.fn() }
      },
      { provide: PrismaService, useValue: prisma },
      { provide: ChatService, useValue: chatService },
      { provide: ChatMemoryToolsService, useValue: chatMemoryTools },
      { provide: FirstPartyAccessService, useValue: firstPartyAccess },
      {
        provide: ExtractionRunService,
        useValue: { result: vi.fn().mockResolvedValue({ status: "pending" }) }
      },
      {
        provide: MemoryProcessingConfigService,
        useValue: { effective: { fingerprint: "test" } }
      }
    ],
    [RealtimeClientService]
  );

  return { service, prisma, chatService, chatMemoryTools, firstPartyAccess };
}
export function stubClientSecretFetch() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        value: "ek_test_secret",
        expires_at: Math.floor(now.getTime() / 1000) + 120
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}
