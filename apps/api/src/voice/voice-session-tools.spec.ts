import { voiceToolCallRequestSchema } from "@funes-vault/shared";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPrismaMock,
  createService,
  now
} from "../../test/fixtures/voice-sessions.js";
afterEach(() => vi.unstubAllEnvs());
describe("privacy: VoiceSessionsService.executeToolCall", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubEnv("OPENAI_API_KEY", undefined);
  });
  it("executes shared steward tools as the voice channel and returns UI events", async () => {
    const { service, chatMemoryTools } = await createService();

    const response = await service.executeToolCall({
      userId: "user_1",
      voiceSessionId: "voice_1",
      body: voiceToolCallRequestSchema.parse({
        toolName: "request_memory",
        toolCallId: "call_1",
        arguments: {
          task: "communication preferences",
          requestedCategories: [],
          tokenBudget: 800
        }
      })
    });

    expect(chatMemoryTools.requestMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        channel: "voice",
        task: "communication preferences"
      })
    );

    const eventTypes = response.events.map((event) => event.type);
    expect(eventTypes).toContain("tool-trace");
    expect(eventTypes).toContain("memory-citation");
    expect(eventTypes).toContain("policy-decision");
    expect(eventTypes).toContain("audit-event");
    expect(response.output).toEqual({
      items: [
        expect.objectContaining({
          memoryId: "memory_1",
          ref: "[1]"
        })
      ]
    });
  });
  it("rejects unknown tools", async () => {
    const { service } = await createService();

    await expect(
      service.executeToolCall({
        userId: "user_1",
        voiceSessionId: "voice_1",
        body: voiceToolCallRequestSchema.parse({
          toolName: "drop_tables",
          toolCallId: "call_1",
          arguments: {}
        })
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("refuses tool calls on ended sessions", async () => {
    const prisma = createPrismaMock();
    prisma.client.voiceSession.findFirst.mockResolvedValue({
      id: "voice_1",
      userId: "user_1",
      chatSessionId: "session_1",
      model: "gpt-realtime-2",
      startedAt: now,
      endedAt: now,
      endReason: "user_ended"
    });
    const { service } = await createService({ prisma });

    await expect(
      service.executeToolCall({
        userId: "user_1",
        voiceSessionId: "voice_1",
        body: voiceToolCallRequestSchema.parse({
          toolName: "request_memory",
          toolCallId: "call_1",
          arguments: {}
        })
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("ends sessions that exceed the maximum duration server-side", async () => {
    const prisma = createPrismaMock();
    prisma.client.voiceSession.findFirst.mockResolvedValue({
      id: "voice_1",
      userId: "user_1",
      chatSessionId: "session_1",
      model: "gpt-realtime-2",
      startedAt: new Date(Date.now() - 601 * 1000),
      endedAt: null,
      endReason: null
    });
    const { service } = await createService({ prisma });

    await expect(
      service.executeToolCall({
        userId: "user_1",
        voiceSessionId: "voice_1",
        body: voiceToolCallRequestSchema.parse({
          toolName: "request_memory",
          toolCallId: "call_1",
          arguments: {}
        })
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.client.voiceSession.update).toHaveBeenCalledWith({
      where: { id: "voice_1" },
      data: expect.objectContaining({ endReason: "max_duration" })
    });
  });
  it("returns tool errors as retryable output instead of HTTP failures", async () => {
    const { service } = await createService({
      chatMemoryTools: {
        requestMemory: vi
          .fn()
          .mockRejectedValue(new Error("policy backend down"))
      }
    });

    const response = await service.executeToolCall({
      userId: "user_1",
      voiceSessionId: "voice_1",
      body: voiceToolCallRequestSchema.parse({
        toolName: "request_memory",
        toolCallId: "call_1",
        arguments: {
          task: "anything",
          requestedCategories: [],
          tokenBudget: 800
        }
      })
    });

    expect(response.output).toEqual(
      expect.objectContaining({ error: "policy backend down", retryable: true })
    );
  });
});
