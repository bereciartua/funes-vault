import { voiceTurnRequestSchema } from "@funes-vault/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createService } from "../../test/fixtures/voice-sessions.js";
afterEach(() => vi.unstubAllEnvs());
describe("privacy: VoiceSessionsService.persistTurn", () => {
  it("persists turns through ChatService with the voice disclosure", async () => {
    const { service, chatService } = await createService();

    const response = await service.persistTurn({
      userId: "user_1",
      voiceSessionId: "voice_1",
      body: voiceTurnRequestSchema.parse({
        role: "assistant",
        content: "Queued that for review.",
        citations: [],
        suggestedMemoryIds: ["suggestion_1"]
      })
    });

    expect(chatService.persistVoiceTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        sessionId: "session_1",
        role: "assistant",
        content: "Queued that for review.",
        suggestedMemoryIds: ["suggestion_1"],
        provider: expect.objectContaining({ channel: "voice" })
      })
    );
    expect(response.message).toEqual(
      expect.objectContaining({ id: "message_1" })
    );
  });
  it("drops suggestion ids from user turns", async () => {
    const { service, chatService } = await createService();

    await service.persistTurn({
      userId: "user_1",
      voiceSessionId: "voice_1",
      body: voiceTurnRequestSchema.parse({
        role: "user",
        content: "Remember that I prefer window seats.",
        suggestedMemoryIds: ["suggestion_1"]
      })
    });

    expect(chatService.persistVoiceTurn).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", suggestedMemoryIds: [] })
    );
  });
});
