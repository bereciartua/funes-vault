import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ChatLaunchProvider } from "../../shell/chat-launch";
import { installApiMock } from "../../test/api-mock";
import { queryWrapper } from "../../test/query-wrapper";
import { ChatPage } from "./ChatPage";
import type { MemoryChatProps } from "./types";
const state = vi.hoisted(() => ({
  props: null as MemoryChatProps | null,
  push: vi.fn()
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("./MemoryChat", () => ({
  MemoryChat: (props: MemoryChatProps) => {
    state.props = props;
    const [text, setText] = useState("");

    return (
      <>
        <input
          aria-label="Next reply"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <p>{props.providerNotice}</p>
      </>
    );
  }
}));
afterEach(() => vi.unstubAllGlobals());
it("keeps typed follow-up text and shows provider disclosure when a draft acquires its persistent URL", async () => {
  installApiMock([
    {
      path: "/v1/chat/threads",
      response: {
        items: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
      }
    },
    {
      path: "/v1/chat/threads/new-id",
      response: {
        sessionId: "new-id",
        title: null,
        titleLocked: false,
        messages: []
      }
    }
  ]);
  render(
    <ChatLaunchProvider>
      <ChatPage draft />
    </ChatLaunchProvider>,
    { wrapper: queryWrapper().wrapper }
  );
  expect(state.props?.selectedThreadId).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Next reply" }), {
    target: { value: "My next thought" }
  });
  act(() => {
    state.props?.setProviderNotice("OpenAI receives selected context");
    state.props?.onThreadState({ sessionId: "new-id", persisted: true }, []);
  });
  await waitFor(() => expect(state.props?.sessionId).toBe("new-id"));
  expect(window.location.pathname).toBe("/chat/new-id");
  expect(
    (screen.getByRole("textbox", { name: "Next reply" }) as HTMLInputElement)
      .value
  ).toBe("My next thought");
  expect(screen.getByText("OpenAI receives selected context")).toBeTruthy();
  expect(state.props?.selectedThreadId).toBe("new-id");
  await act(async () => state.props?.onNewThread());
  expect(state.props?.sessionId).toBeNull();
  expect(state.props?.selectedThreadId).toBeNull();
  expect(state.push).toHaveBeenLastCalledWith("/chat/new");
});
