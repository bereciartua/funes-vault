import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pageFixture } from "../../test/fixtures/memory";
import { queryWrapper } from "../../test/query-wrapper";
import { render } from "../../test/render";
import type { VoiceSessionPanel } from "../voice/VoiceSessionPanel";
import { MemoryChat } from "./MemoryChat";
import type { MemoryChatProps } from "./types";
const state = vi.hoisted(() => ({
  transport: {
    clearError: vi.fn(),
    error: null,
    messages: [],
    sendMessage: vi.fn(async () => undefined),
    setMessages: vi.fn(),
    stop: vi.fn(),
    isStreaming: false,
    statusMessage: null,
    setStatusMessage: vi.fn(),
    localError: null,
    setLocalError: vi.fn(),
    resetThreadState: vi.fn()
  },
  voice: null as ComponentProps<typeof VoiceSessionPanel> | null
}));
vi.mock("./hooks/use-chat-transport", () => ({
  useChatTransport: () => state.transport
}));
vi.mock("../voice/VoiceSessionPanel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../voice/VoiceSessionPanel")>()),
  VoiceSessionPanel: (props: ComponentProps<typeof VoiceSessionPanel>) => {
    state.voice = props;

    return <div role="status">Voice connected</div>;
  }
}));
function props(): MemoryChatProps {
  return {
    activeThreadTitle: null,
    initialEntries: [],
    pendingInitialMessage: null,
    sessionId: null,
    selectedThreadId: null,
    threadPagination: pageFixture([]).pagination,
    threads: [],
    onOpenMemory: vi.fn(async () => undefined),
    onOpenInbox: vi.fn(),
    setProviderNotice: vi.fn(),
    onPendingInitialMessageConsumed: vi.fn(),
    onVoiceStartConsumed: vi.fn(),
    onRenameThread: vi.fn(async () => undefined),
    onSuggestionsChanged: vi.fn(async () => undefined),
    onThreadPageChange: vi.fn(),
    onThreadsChanged: vi.fn(async () => undefined),
    onThreadState: vi.fn(),
    onSelectThread: vi.fn(async () => undefined),
    onNewThread: vi.fn(async () => undefined)
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.voice = null;
  state.transport.isStreaming = false;
});
describe("chat container", () => {
  it("sends a pending overview message once across rerenders", async () => {
    const input = {
      ...props(),
      pendingInitialMessage: {
        id: "launch-1",
        text: "Remember this",
        startNewThread: true as const
      }
    };
    const { rerender } = render(<MemoryChat {...input} />, {
      wrapper: queryWrapper().wrapper
    });
    await waitFor(() =>
      expect(state.transport.sendMessage).toHaveBeenCalledOnce()
    );
    rerender(<MemoryChat {...input} />);
    expect(state.transport.sendMessage).toHaveBeenCalledOnce();
    expect(state.transport.sendMessage).toHaveBeenCalledWith({
      text: "Remember this",
      metadata: { createdAt: expect.any(String) }
    });
    expect(input.onPendingInitialMessageConsumed).toHaveBeenCalledOnce();
  });
  it("opens voice and reloads its persisted thread after the session ends", async () => {
    const input = { ...props(), sessionId: "bound-thread" };
    render(<MemoryChat {...input} />, { wrapper: queryWrapper().wrapper });
    fireEvent.click(
      screen.getByRole("button", { name: "Start voice session" })
    );
    await screen.findByText("Voice connected");
    expect(state.voice?.sessionId).toBe("bound-thread");
    await act(async () => {
      state.voice?.onSessionEnded({
        threadSessionId: "bound-thread",
        persistedTurns: 2,
        reason: "user_ended"
      });
    });
    expect(input.onThreadsChanged).toHaveBeenCalledOnce();
    expect(input.onSelectThread).toHaveBeenCalledWith("bound-thread");
  });
  it("starts overview voice in a fresh thread before mounting the controller", async () => {
    const input = { ...props(), autoStartVoice: true };
    render(<MemoryChat {...input} />, { wrapper: queryWrapper().wrapper });
    await screen.findByText("Voice connected");
    expect(input.onNewThread).toHaveBeenCalledOnce();
    expect(input.onVoiceStartConsumed).toHaveBeenCalledOnce();
  });
});
