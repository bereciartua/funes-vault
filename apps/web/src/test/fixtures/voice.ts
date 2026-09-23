import type { VoiceSessionResponse } from "@funes-vault/shared";
export const voiceFixture: VoiceSessionResponse = {
  voiceSessionId: "voice-one",
  sessionId: "thread-one",
  title: null,
  model: "realtime-test",
  voice: "marin",
  clientSecret: {
    value: "ephemeral-test-token",
    expiresAt: "2026-09-22T12:01:00.000Z"
  },
  limits: {
    maxDurationSeconds: 60,
    idleTimeoutSeconds: 30,
    dailySessionCap: 5,
    dailySessionsUsed: 1
  },
  provider: {
    provider: "openai",
    model: "realtime-test",
    usesThirdParty: true,
    disclosure: "Test provider disclosure"
  }
};
export const voiceEndedFixture = {
  voiceSessionId: "voice-one",
  endedAt: "2026-09-22T12:00:30.000Z",
  endReason: "user_ended"
};
