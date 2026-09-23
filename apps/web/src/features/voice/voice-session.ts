import {
  voiceSessionEndedResponseSchema,
  type VoiceSessionEndReason,
  type VoiceSessionResponse,
  voiceSessionResponseSchema
} from "@funes-vault/shared";

import { ApiError, apiFetch } from "../../lib/api/api-client";
import { createVoiceMessageBridge } from "./voice-message-bridge";
import type { VoiceUiAction } from "./voice-session-state";

const realtimeCallsUrl = "https://api.openai.com/v1/realtime/calls";

export type VoiceSessionCallbacks = {
  dispatch: (action: VoiceUiAction) => void;
  onSuggestionsChanged?: () => void;
  onEnded?: (input: {
    reason: VoiceSessionEndReason;
    threadSessionId: string | null;
    persistedTurns: number;
  }) => void;
};

export type VoiceSessionController = {
  start: (options?: {
    sessionId?: string;
    startNewThread?: boolean;
  }) => Promise<void>;
  stop: (reason?: VoiceSessionEndReason) => Promise<void>;
  isActive: () => boolean;
  threadSessionId: () => string | null;
};

export function createVoiceSessionController(input: {
  apiUrl: string;
  callbacks: VoiceSessionCallbacks;
}): VoiceSessionController {
  const { apiUrl, callbacks } = input;

  let config: VoiceSessionResponse | null = null;
  let peer: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let micStream: MediaStream | null = null;
  let audioElement: HTMLAudioElement | null = null;
  let active = false;
  let ending = false;
  // Guards against overlapping starts (React strict-mode double effects,
  // double taps): a second start while one is in flight would mint a second
  // provider session and corrupt the shared connection state.
  let starting = false;
  let cancelled = false;

  let maxDurationTimer: number | null = null;
  let idleTimer: number | null = null;

  function clearTimers() {
    if (maxDurationTimer !== null) {
      window.clearTimeout(maxDurationTimer);
    }
    if (idleTimer !== null) {
      window.clearTimeout(idleTimer);
    }
    maxDurationTimer = null;
    idleTimer = null;
  }

  function armIdleTimer() {
    if (!config || !active) {
      return;
    }

    if (idleTimer !== null) {
      window.clearTimeout(idleTimer);
    }
    idleTimer = window.setTimeout(() => {
      void stop("idle_timeout");
    }, config.limits.idleTimeoutSeconds * 1000);
  }

  function noteActivity() {
    armIdleTimer();
  }

  function sendDataChannelEvent(payload: Record<string, unknown>) {
    if (dataChannel && dataChannel.readyState === "open") {
      dataChannel.send(JSON.stringify(payload));
    }
  }

  const bridge = createVoiceMessageBridge({
    apiUrl,
    callbacks,
    getConfig: () => config,
    sendDataChannelEvent,
    noteActivity,
    stop
  });

  async function abortStart(sessionConfig: VoiceSessionResponse | null) {
    cleanupMedia();
    config = null;

    if (sessionConfig) {
      // A provider session was already minted; record it as ended so the
      // daily-cap bookkeeping stays truthful.
      try {
        await apiFetch({
          apiUrl,
          path: `/v1/chat/voice-sessions/${sessionConfig.voiceSessionId}/end`,
          schema: voiceSessionEndedResponseSchema,
          method: "PATCH",
          body: { reason: "user_ended" }
        });
      } catch {
        // Best effort.
      }
    }
  }

  async function start(options?: {
    sessionId?: string;
    startNewThread?: boolean;
  }) {
    if (starting || active || ending) {
      return;
    }

    starting = true;
    cancelled = false;
    let sessionConfig: VoiceSessionResponse;

    try {
      callbacks.dispatch({ kind: "start-requested" });

      try {
        sessionConfig = await apiFetch({
          apiUrl,
          path: "/v1/chat/voice-sessions",
          schema: voiceSessionResponseSchema,
          method: "POST",
          body: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            sessionId: options?.sessionId,
            startNewThread: options?.startNewThread
          }
        });
      } catch (error) {
        if (!cancelled) {
          callbacks.dispatch({
            kind: "connection-failed",
            message:
              error instanceof ApiError && error.status === 429
                ? "Daily voice session limit reached. Try again tomorrow."
                : error instanceof ApiError && error.status === 503
                  ? "Voice needs a configured OpenAI API key on the vault."
                  : error instanceof ApiError && error.kind === "unreachable"
                    ? "Could not reach your vault to start the voice session."
                    : "Your vault declined to start a voice session."
          });
        }

        return;
      }

      if (cancelled) {
        await abortStart(sessionConfig);

        return;
      }
      config = sessionConfig;

      if (cancelled) {
        await abortStart(sessionConfig);

        return;
      }

      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        callbacks.dispatch({
          kind: "mic-denied",
          message:
            "Microphone access was denied. Allow the microphone for this app and try again."
        });
        await abortStart(sessionConfig);

        return;
      }

      if (cancelled) {
        await abortStart(sessionConfig);

        return;
      }

      callbacks.dispatch({ kind: "mic-granted" });

      try {
        peer = new RTCPeerConnection();
        audioElement = new Audio();
        audioElement.autoplay = true;

        peer.ontrack = (event) => {
          if (audioElement && event.streams[0]) {
            audioElement.srcObject = event.streams[0];
          }
        };
        peer.onconnectionstatechange = () => {
          if (!peer) {
            return;
          }
          if (
            active &&
            (peer.connectionState === "failed" ||
              peer.connectionState === "disconnected" ||
              peer.connectionState === "closed")
          ) {
            void stop("connection_lost");
          }
        };

        for (const track of micStream.getTracks()) {
          peer.addTrack(track, micStream);
        }

        dataChannel = peer.createDataChannel("oai-events");
        dataChannel.onmessage = bridge.handleDataChannelMessage;

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        if (cancelled) {
          await abortStart(sessionConfig);

          return;
        }

        const sdpResponse = await fetch(
          `${realtimeCallsUrl}?model=${encodeURIComponent(sessionConfig.model)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sessionConfig.clientSecret.value}`,
              "Content-Type": "application/sdp"
            },
            body: offer.sdp
          }
        );

        if (!sdpResponse.ok) {
          throw new Error(
            `Realtime handshake failed with status ${sdpResponse.status}`
          );
        }

        await peer.setRemoteDescription({
          type: "answer",
          sdp: await sdpResponse.text()
        });

        if (cancelled) {
          await abortStart(sessionConfig);

          return;
        }

        active = true;
        bridge.reset();
        callbacks.dispatch({ kind: "connected" });

        maxDurationTimer = window.setTimeout(() => {
          void stop("max_duration");
        }, sessionConfig.limits.maxDurationSeconds * 1000);
        armIdleTimer();
      } catch (error) {
        const detail =
          error instanceof Error && error.message ? ` (${error.message})` : "";

        await abortStart(sessionConfig);
        if (!cancelled) {
          callbacks.dispatch({
            kind: "connection-failed",
            message: `Could not open the realtime voice connection${detail}. Check your network and try again.`
          });
        }
      }
    } finally {
      starting = false;
    }
  }

  function cleanupMedia() {
    clearTimers();

    if (dataChannel) {
      dataChannel.onmessage = null;
      try {
        dataChannel.close();
      } catch {
        // Already closed.
      }
    }
    dataChannel = null;

    if (peer) {
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      try {
        peer.close();
      } catch {
        // Already closed.
      }
    }
    peer = null;

    if (micStream) {
      for (const track of micStream.getTracks()) {
        track.stop();
      }
    }
    micStream = null;

    if (audioElement) {
      audioElement.srcObject = null;
    }
    audioElement = null;
  }

  async function reportEnd(reason: VoiceSessionEndReason) {
    if (!config) {
      return;
    }

    try {
      await apiFetch({
        apiUrl,
        path: `/v1/chat/voice-sessions/${config.voiceSessionId}/end`,
        schema: voiceSessionEndedResponseSchema,
        method: "PATCH",
        body: { reason }
      });
    } catch {
      // End bookkeeping is best-effort from the client.
    }
  }

  async function stop(reason: VoiceSessionEndReason = "user_ended") {
    // A stop while a start is still in flight cancels it; the start's
    // checkpoints release resources and end the minted session.
    if (starting) {
      cancelled = true;

      return;
    }

    if (ending || (!active && !config)) {
      return;
    }

    ending = true;
    const wasActive = active;
    active = false;
    cleanupMedia();

    if (wasActive || config) {
      callbacks.dispatch({ kind: "ended", reason });
      await reportEnd(reason);
      callbacks.onEnded?.({
        reason,
        threadSessionId: config?.sessionId ?? null,
        persistedTurns: bridge.persistedTurns()
      });
    }

    config = null;
    ending = false;
  }

  return {
    start,
    stop,
    isActive: () => active,
    threadSessionId: () => config?.sessionId ?? null
  };
}
