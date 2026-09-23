import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installApiMock } from "../../../test/api-mock";
import { pageFixture } from "../../../test/fixtures/memory";
import { queryWrapper } from "../../../test/query-wrapper";
import { useChatSession } from "./use-chat-session";
import { useChatThreads, useThreadRename } from "./use-chat-threads";
afterEach(() => vi.unstubAllGlobals());
describe("chat queries", () => {
  it("does not load a previous session into a new draft", async () => {
    const fetch = installApiMock([
      {
        path: "/v1/chat/threads/thread%20one",
        response: { sessionId: "thread one", messages: [] }
      }
    ]);
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(
      ({ id, draft }: { id: string | null; draft: boolean }) =>
        useChatSession(id, draft),
      { wrapper, initialProps: { id: null as string | null, draft: true } }
    );
    expect(fetch).not.toHaveBeenCalled();
    rerender({ id: "thread one", draft: false });
    await waitFor(() =>
      expect(result.current.data?.sessionId).toBe("thread one")
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("refreshes the thread title after renaming", async () => {
    let title = "Old title";
    const thread = () => ({
      sessionId: "thread-one",
      title,
      titleLocked: true,
      messageCount: 2,
      lastMessagePreview: "Hello",
      createdAt: "2026-09-22T12:00:00.000Z",
      updatedAt: "2026-09-22T12:00:00.000Z"
    });
    installApiMock([
      { path: "/v1/chat/threads", response: () => pageFixture([thread()]) },
      {
        method: "PATCH",
        path: "/v1/chat/threads/thread-one",
        response: () => {
          title = "New title";

          return thread();
        }
      }
    ]);
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => ({ threads: useChatThreads(1), rename: useThreadRename() }),
      { wrapper }
    );
    await waitFor(() =>
      expect(result.current.threads.data?.items[0]?.title).toBe("Old title")
    );
    await act(async () => {
      await result.current.rename.mutateAsync({
        sessionId: "thread-one",
        title: "New title"
      });
    });
    await waitFor(() =>
      expect(result.current.threads.data?.items[0]?.title).toBe("New title")
    );
  });
});
