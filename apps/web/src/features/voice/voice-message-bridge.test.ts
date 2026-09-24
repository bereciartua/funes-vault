import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../lib/api/api-client";
import { voiceFixture } from "../../test/fixtures/voice";
import { createVoiceMessageBridge } from "./voice-message-bridge";

vi.mock("../../lib/api/api-client", async (load) => ({
  ...(await load<typeof import("../../lib/api/api-client")>()),
  apiFetch: vi.fn()
}));
beforeEach(() => vi.mocked(apiFetch).mockReset());
afterEach(() => vi.useRealTimers());

function setup() {
  const send = vi.fn();
  const dispatch = vi.fn();
  const bridge = createVoiceMessageBridge({
    apiUrl: "http://vault.test",
    callbacks: { dispatch },
    getConfig: () => voiceFixture,
    sendDataChannelEvent: send,
    noteActivity: vi.fn(),
    stop: vi.fn()
  });
  const event = (body: Record<string, unknown>) =>
    bridge.handleDataChannelMessage({
      data: JSON.stringify(body)
    } as MessageEvent<string>);

  return {
    bridge,
    send,
    dispatch,
    speech: (id: string) =>
      event({ type: "input_audio_buffer.speech_started", item_id: id }),
    transcript: (id: string) =>
      event({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: id,
        transcript: "I prefer quiet rooms."
      }),
    tool: (id = "call") =>
      event({
        type: "response.function_call_arguments.done",
        call_id: id,
        name: "memory_capture_result",
        arguments: "{}"
      })
  };
}
async function flush() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve();
  }
}
function delayedTurn() {
  let resolve!: (value: unknown) => void;
  const pending = new Promise((done) => {
    resolve = done;
  });
  vi.mocked(apiFetch).mockReturnValueOnce(pending);

  return resolve;
}
const processing = {
  status: "skipped",
  reason: "voice_transcript_arrived_too_late"
};

describe("voice capture result ordering", () => {
  it("waits through transcription and processing before returning the actual skip reason", async () => {
    const finish = delayedTurn();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      output: processing,
      events: []
    });
    const ui = setup();
    ui.speech("source");
    ui.tool();
    await flush();
    expect(apiFetch).not.toHaveBeenCalled();
    ui.transcript("source");
    await flush();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    finish({ message: { processing } });
    await flush();
    expect(apiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: "/v1/chat/voice-sessions/voice-one/tool-calls",
        body: expect.objectContaining({ sourceItemId: "source" })
      })
    );
    expect(ui.send).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          type: "function_call_output",
          output: JSON.stringify(processing)
        })
      })
    );
  });

  it("does not rebind a waiting call or a newer utterance when an older transcript finishes late", async () => {
    const finish = delayedTurn();
    vi.mocked(apiFetch).mockResolvedValue({ output: processing, events: [] });
    const ui = setup();
    ui.speech("old");
    ui.tool("old-call");
    ui.speech("new");
    ui.transcript("old");
    finish({ message: { processing } });
    await flush();
    expect(apiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          sourceItemId: "old",
          toolCallId: "old-call"
        })
      })
    );
    const finishNew = delayedTurn();
    ui.transcript("new");
    ui.tool("new-call");
    finishNew({ message: { processing } });
    await flush();
    expect(apiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          sourceItemId: "new",
          toolCallId: "new-call"
        })
      })
    );
  });

  it("uses a bounded wait when transcription never arrives", async () => {
    vi.useFakeTimers();
    vi.mocked(apiFetch).mockResolvedValue({
      output: { status: "pending" },
      events: []
    });
    const ui = setup();
    ui.speech("missing");
    ui.tool();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(ui.send).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          output: JSON.stringify({ status: "pending" })
        })
      })
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards waiting calls when the bridge resets", async () => {
    const ui = setup();
    ui.speech("old-session");
    ui.tool();
    ui.bridge.reset();
    await flush();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(ui.send).not.toHaveBeenCalled();
  });

  it("does not leave a failed transcript save showing processing forever", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline"));
    const ui = setup();
    ui.transcript("source");
    await flush();
    expect(ui.dispatch).toHaveBeenCalledWith({
      kind: "memory-processing",
      itemId: "source",
      result: { status: "failed", reason: "transcript_persistence_failed" }
    });
  });
});
