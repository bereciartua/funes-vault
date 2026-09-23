import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../lib/api/api-client";
import { voiceEndedFixture, voiceFixture } from "../../test/fixtures/voice";
import { createVoiceSessionController } from "./voice-session";
vi.mock("../../lib/api/api-client", async (load) => ({
  ...(await load<typeof import("../../lib/api/api-client")>()),
  apiFetch: vi.fn()
}));
beforeEach(() => vi.mocked(apiFetch).mockReset());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("voice controller resource lifecycle", () => {
  it("ends a session minted after the user canceled startup without opening the microphone", async () => {
    let resolve: ((value: typeof voiceFixture) => void) | undefined;
    vi.mocked(apiFetch)
      .mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        })
      )
      .mockResolvedValueOnce(voiceEndedFixture);
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const dispatch = vi.fn();
    const controller = createVoiceSessionController({
      apiUrl: "http://vault.test",
      callbacks: { dispatch }
    });
    const starting = controller.start();
    await controller.stop();
    resolve?.(voiceFixture);
    await starting;
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: "/v1/chat/voice-sessions/voice-one/end",
        body: { reason: "user_ended" }
      })
    );
    expect(controller.isActive()).toBe(false);
  });
  it("records the minted session as ended after microphone denial", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(voiceFixture)
      .mockResolvedValueOnce(voiceEndedFixture);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("Denied"))
      }
    });
    const dispatch = vi.fn();
    const controller = createVoiceSessionController({
      apiUrl: "http://vault.test",
      callbacks: { dispatch }
    });
    await controller.start();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "mic-denied" })
    );
    expect(controller.threadSessionId()).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
  it("closes tracks and transport once, and reports the bound thread on stop", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(voiceFixture)
      .mockResolvedValueOnce(voiceEndedFixture);
    const trackStop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi
          .fn()
          .mockResolvedValue({ getTracks: () => [{ stop: trackStop }] })
      }
    });
    const channelClose = vi.fn();
    const peerClose = vi.fn();
    vi.stubGlobal(
      "RTCPeerConnection",
      class {
        connectionState = "connected";
        ontrack = null;
        onconnectionstatechange = null;
        addTrack() {}
        createDataChannel() {
          return { onmessage: null, close: channelClose };
        }

        async createOffer() {
          return { sdp: "test-offer" };
        }

        async setLocalDescription() {}
        async setRemoteDescription() {}
        close() {
          peerClose();
        }
      }
    );
    vi.stubGlobal(
      "Audio",
      class {
        autoplay = false;
        srcObject = null;
      }
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("test-answer"))
    );
    const onEnded = vi.fn();
    const controller = createVoiceSessionController({
      apiUrl: "http://vault.test",
      callbacks: { dispatch: vi.fn(), onEnded }
    });
    await controller.start({ sessionId: "thread-one" });
    expect(controller.isActive()).toBe(true);
    await controller.stop();
    await controller.stop();
    await waitFor(() =>
      expect(onEnded).toHaveBeenCalledWith({
        reason: "user_ended",
        threadSessionId: "thread-one",
        persistedTurns: 0
      })
    );
    expect(trackStop).toHaveBeenCalledOnce();
    expect(channelClose).toHaveBeenCalledOnce();
    expect(peerClose).toHaveBeenCalledOnce();
  });
});
