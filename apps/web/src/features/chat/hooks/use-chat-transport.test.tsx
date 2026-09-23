import type { FunesDataParts } from "@funes-vault/shared";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryWrapper } from "../../../test/query-wrapper";
import type { FunesUIMessage } from "../types";
import { useChatTransport } from "./use-chat-transport";
type DataPart =
  | { type: "data-thread-state"; data: FunesDataParts["thread-state"] }
  | {
      type: "data-memory-suggestion";
      data: FunesDataParts["memory-suggestion"];
    };
type Options = {
  id: string;
  onData: (part: DataPart) => void;
  onFinish: (input: { message: FunesUIMessage }) => void;
  onError: (error: Error) => void;
};
const sdk = vi.hoisted(() => ({
  options: null as Options | null,
  transport: vi.fn(),
  messages: [] as FunesUIMessage[],
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  clearError: vi.fn(),
  stop: vi.fn()
}));
vi.mock("@ai-sdk/react", () => ({
  useChat: (options: Options) => {
    sdk.options = options;

    return {
      messages: sdk.messages,
      sendMessage: sdk.sendMessage,
      setMessages: sdk.setMessages,
      clearError: sdk.clearError,
      stop: sdk.stop,
      status: "ready",
      error: undefined
    };
  }
}));
vi.mock("ai", () => ({
  DefaultChatTransport: class {
    constructor(options: unknown) {
      sdk.transport(options);
    }
  }
}));
beforeEach(() => {
  vi.clearAllMocks();
  sdk.messages = [];
});
function props() {
  return {
    sessionId: null,
    initialEntries: [],
    setProviderNotice: vi.fn(),
    onSuggestionsChanged: vi.fn(async () => undefined),
    onThreadsChanged: vi.fn(async () => undefined),
    onThreadState: vi.fn()
  };
}
describe("chat transport lifecycle", () => {
  it("keeps a newly persisted thread pending until the final message is merged", () => {
    const input = props();
    renderHook(() => useChatTransport(input), {
      wrapper: queryWrapper().wrapper
    });
    expect(sdk.transport).toHaveBeenCalledWith(
      expect.objectContaining({
        api: "http://vault.test/v1/chat/messages/stream",
        credentials: "include"
      })
    );
    act(() =>
      sdk.options?.onData({
        type: "data-thread-state",
        data: { sessionId: "new-thread", persisted: true }
      })
    );
    expect(input.onThreadState).not.toHaveBeenCalled();
    act(() =>
      sdk.options?.onFinish({
        message: {
          id: "answer",
          role: "assistant",
          parts: [{ type: "text", text: "The completed answer", state: "done" }]
        }
      })
    );
    expect(input.onThreadState).toHaveBeenCalledWith(
      { sessionId: "new-thread", persisted: true },
      [expect.objectContaining({ content: "The completed answer" })]
    );
    expect(input.onThreadsChanged).toHaveBeenCalledOnce();
  });
  it("preserves a persisted thread after a stream failure and reports a useful error", () => {
    const input = props();
    const { result } = renderHook(() => useChatTransport(input), {
      wrapper: queryWrapper().wrapper
    });
    act(() =>
      sdk.options?.onData({
        type: "data-thread-state",
        data: { sessionId: "persisted", persisted: true }
      })
    );
    act(() => sdk.options?.onError(new Error("HTTP 503")));
    expect(input.onThreadState).toHaveBeenCalledWith(
      { sessionId: "persisted", persisted: true },
      []
    );
    expect(result.current.localError).toContain("configured model provider");
  });
});

it("keeps live privacy and tool parts when the server query refetches", () => {
  const input = props();
  const live = {
    id: "answer",
    role: "assistant" as const,
    parts: [
      {
        type: "data-transient-notification" as const,
        data: { level: "info" as const, message: "Policy allowed; audit-1" }
      }
    ]
  };
  sdk.messages = [live];
  const { result, rerender } = renderHook(
    ({ entries }) => useChatTransport({ ...input, initialEntries: entries }),
    {
      initialProps: { entries: input.initialEntries },
      wrapper: queryWrapper().wrapper
    }
  );
  rerender({ entries: [] });
  expect(sdk.setMessages).not.toHaveBeenCalled();
  expect(result.current.messages).toEqual([live]);
});

it("updates the original SDK transport for follow-ups and clears its destination for New thread", () => {
  const input = props();
  const { result, rerender } = renderHook(
    ({ sessionId }: { sessionId: string | null }) =>
      useChatTransport({ ...input, sessionId }),
    {
      initialProps: { sessionId: null as string | null },
      wrapper: queryWrapper().wrapper
    }
  );
  const original = sdk.transport.mock.calls[0]?.[0] as {
    prepareSendMessagesRequest: (input: {
      messages: FunesUIMessage[];
      trigger: string;
    }) => { body: Record<string, unknown> };
  };
  const request = () =>
    original.prepareSendMessagesRequest({
      messages: [
        {
          id: "turn",
          role: "user",
          parts: [{ type: "text", text: "Next turn" }]
        }
      ],
      trigger: "submit-message"
    }).body;
  expect(request()).toMatchObject({ startNewThread: true });
  rerender({ sessionId: "persisted" });
  expect(request()).toMatchObject({
    sessionId: "persisted",
    startNewThread: undefined
  });
  act(() => result.current.resetThreadState());
  rerender({ sessionId: null });
  expect(request()).toMatchObject({ startNewThread: true });
  expect(request().sessionId).toBeUndefined();
  expect(sdk.transport).toHaveBeenCalledOnce();
});
