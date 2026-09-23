import { type ChatProviderDisclosure } from "@funes-vault/shared";

import { apiEnv } from "../config.js";
export function voiceRealtimeModel() {
  return apiEnv().OPENAI_REALTIME_MODEL;
}
export function voiceRealtimeVoice() {
  // Funes is Borges' Ireneo Funes, so the default voice is male.
  return apiEnv().OPENAI_REALTIME_VOICE;
}
export function voiceTranscriptionModel() {
  return apiEnv().OPENAI_REALTIME_TRANSCRIPTION_MODEL;
}
export function voiceSessionLimits() {
  const env = apiEnv();

  return {
    maxDurationSeconds: env.VOICE_MAX_SESSION_SECONDS,
    idleTimeoutSeconds: env.VOICE_IDLE_TIMEOUT_SECONDS,
    dailySessionCap: env.VOICE_DAILY_SESSION_CAP
  };
}
export function voiceProviderDisclosure(): ChatProviderDisclosure {
  return {
    provider: "openai",
    model: voiceRealtimeModel(),
    usesThirdParty: true,
    channel: "voice",
    disclosure:
      "Voice sessions stream your microphone audio and any retrieved memory text to the OpenAI Realtime API and receive synthesized speech back."
  };
}
/** @internal */
export function utcDayStart(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}
