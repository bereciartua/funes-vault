import { afterEach, describe, expect, it, vi } from "vitest";

import {
  utcDayStart,
  voiceProviderDisclosure,
  voiceRealtimeModel,
  voiceSessionLimits
} from "./voice.config.js";
afterEach(() => vi.unstubAllEnvs());
describe("privacy: voice session configuration", () => {
  afterEach(() => {
    vi.stubEnv("OPENAI_REALTIME_MODEL", undefined);
    vi.stubEnv("VOICE_MAX_SESSION_SECONDS", undefined);
    vi.stubEnv("VOICE_DAILY_SESSION_CAP", undefined);
  });
  it("defaults to gpt-realtime-2 and allows an env override", () => {
    expect(voiceRealtimeModel()).toBe("gpt-realtime-2");
    vi.stubEnv("OPENAI_REALTIME_MODEL", "gpt-realtime-3");
    expect(voiceRealtimeModel()).toBe("gpt-realtime-3");
  });
  it("provides conservative default limits with env overrides", () => {
    expect(voiceSessionLimits()).toEqual({
      maxDurationSeconds: 600,
      idleTimeoutSeconds: 90,
      dailySessionCap: 20
    });

    vi.stubEnv("VOICE_MAX_SESSION_SECONDS", "300");
    expect(voiceSessionLimits().maxDurationSeconds).toBe(300);

    // Malformed numeric configuration fails loudly (and is caught at boot
    // by validateEnvironment) instead of silently falling back.
    vi.stubEnv("VOICE_DAILY_SESSION_CAP", "not-a-number");
    expect(() => voiceSessionLimits()).toThrow(/VOICE_DAILY_SESSION_CAP/);
    vi.stubEnv("VOICE_DAILY_SESSION_CAP", undefined);
  });
  it("discloses the voice data path", () => {
    const disclosure = voiceProviderDisclosure();

    expect(disclosure.channel).toBe("voice");
    expect(disclosure.usesThirdParty).toBe(true);
    expect(disclosure.disclosure).toContain("microphone audio");
    expect(disclosure.disclosure).toContain("retrieved memory text");
  });
  it("computes the UTC day window for the daily cap", () => {
    expect(
      utcDayStart(new Date("2026-07-04T23:59:00.000Z")).toISOString()
    ).toBe("2026-07-04T00:00:00.000Z");
  });
});
