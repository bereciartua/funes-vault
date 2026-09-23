import { endVoiceSessionRequestSchema } from "@funes-vault/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPrismaMock,
  createService,
  now
} from "../../test/fixtures/voice-sessions.js";
afterEach(() => vi.unstubAllEnvs());
describe("privacy: VoiceSessionsService.endVoiceSession", () => {
  it("records the end reason and is idempotent", async () => {
    const prisma = createPrismaMock();
    const { service } = await createService({ prisma });

    const ended = await service.endVoiceSession({
      userId: "user_1",
      voiceSessionId: "voice_1",
      body: endVoiceSessionRequestSchema.parse({ reason: "idle_timeout" })
    });

    expect(ended.endReason).toBe("idle_timeout");
    expect(prisma.client.voiceSession.update).toHaveBeenCalled();

    prisma.client.voiceSession.findFirst.mockResolvedValue({
      id: "voice_1",
      userId: "user_1",
      chatSessionId: "session_1",
      model: "gpt-realtime-2",
      startedAt: now,
      endedAt: now,
      endReason: "idle_timeout"
    });
    prisma.client.voiceSession.update.mockClear();

    const again = await service.endVoiceSession({
      userId: "user_1",
      voiceSessionId: "voice_1",
      body: endVoiceSessionRequestSchema.parse({})
    });

    expect(again.endReason).toBe("idle_timeout");
    expect(prisma.client.voiceSession.update).not.toHaveBeenCalled();
  });
});
