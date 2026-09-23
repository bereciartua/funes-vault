import type { ReactNode } from "react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { ApiProvider } from "../../lib/api/api-context";
import { renderToStaticMarkup as renderStatic } from "../../test/render";
import { chatDateDividerLabel, chatDayKey, chatDayLabel } from "./chat-dates";
import { ChatThreadHistory } from "./components/ChatThreadHistory";
import { MemoryMessage } from "./components/MemoryMessage";
import { normalizeThreadRenameTitle } from "./components/ThreadRenameForm";
import {
  buildChatStreamRequestBody,
  shouldConsumePendingInitialMessage
} from "./message-parts";
import { type FunesUIMessage } from "./types";

const provider = {
  provider: "openai",
  model: "gpt-5.5",
  usesThirdParty: true,
  disclosure:
    "Chat sends the current message and retrieved memory snippets to the configured OpenAI model provider."
};

const streamedMessage: FunesUIMessage = {
  id: "assistant_1",
  role: "assistant",
  metadata: {
    sessionId: "session_1",
    persistedMessageId: "message_1",
    createdAt: "2026-06-29T12:00:00.000Z",
    provider
  },
  parts: [
    {
      type: "text",
      text: "Your vault says you prefer concise help. [1]",
      state: "done"
    },
    {
      type: "data-memory-citation",
      id: "memory_1",
      data: {
        memoryId: "memory_1",
        title: "Prefers concise help",
        categoryKeys: ["communication_style"],
        sensitivity: "LOW",
        relevanceScore: 0.91,
        ref: "[1]"
      }
    },
    {
      type: "data-provider-disclosure",
      id: "provider_1",
      data: provider
    },
    {
      type: "data-policy-decision",
      id: "policy_1",
      data: {
        operation: "READ",
        decision: "ALLOW",
        clientId: null,
        policyId: "policy_1",
        reasons: []
      }
    },
    {
      type: "data-memory-suggestion",
      id: "suggestion_1",
      data: {
        suggestionId: "suggestion_1",
        title: "Communication preference",
        status: "QUEUED_FOR_REVIEW",
        memoryId: null,
        policyId: "policy_1",
        auditEventId: "audit_1",
        decision: "ALLOW",
        categoryKeys: ["communication_style"],
        sensitivity: "LOW"
      }
    },
    {
      type: "data-tool-trace",
      id: "tool_1",
      data: {
        toolCallId: "tool_1",
        toolName: "request_memory",
        label: "Memory retrieval",
        status: "completed",
        summary: "1 memory references returned.",
        metadata: { returnedCount: 1 }
      }
    }
  ]
};

const userMessage: FunesUIMessage = {
  id: "user_1",
  role: "user",
  metadata: {
    sessionId: "session_1",
    persistedMessageId: "message_user_1",
    createdAt: "2026-06-29T12:00:00.000Z"
  },
  parts: [
    {
      type: "text",
      text: "Start a new thread from the overview composer.",
      state: "done"
    }
  ]
};

const markdownMessage: FunesUIMessage = {
  ...streamedMessage,
  id: "assistant_markdown",
  parts: [
    {
      type: "text",
      text: "I can help:\n\n- **Remember durable things** [1]\n- Use `privacy boundaries`\n\n[Read more](https://example.com)",
      state: "done"
    },
    streamedMessage.parts[1]!
  ]
};

describe("memory workbench rendering", () => {
  it("groups transcript dividers by local calendar day", () => {
    const today = new Date(2026, 6, 10, 12);
    const todayAtNight = new Date(2026, 6, 10, 23, 30).toISOString();
    const yesterday = new Date(2026, 6, 9, 18).toISOString();

    expect(chatDayKey(todayAtNight)).toBe("2026-07-10");
    expect(chatDayLabel(todayAtNight, today)).toBe("Today");
    expect(chatDayLabel(yesterday, today)).toBe("Yesterday");
  });

  it("omits a redundant Today divider when the conversation starts today", () => {
    const today = new Date(2026, 6, 10, 12);
    const datedAssistant = {
      ...streamedMessage,
      metadata: {
        ...streamedMessage.metadata,
        createdAt: new Date(2026, 6, 10, 10).toISOString()
      }
    };
    const undatedUser = {
      ...userMessage,
      metadata: undefined
    };
    const laterAssistant = {
      ...streamedMessage,
      id: "assistant_2",
      metadata: {
        ...streamedMessage.metadata,
        createdAt: new Date(2026, 6, 10, 11).toISOString()
      }
    };
    const messages = [datedAssistant, undatedUser, laterAssistant];

    expect(chatDateDividerLabel(messages, 0, today)).toBeNull();
    expect(chatDateDividerLabel(messages, 1, today)).toBeNull();
    expect(chatDateDividerLabel(messages, 2, today)).toBeNull();
  });

  it("does not insert Today between an undated opening and its first reply", () => {
    const today = new Date(2026, 6, 10, 12);
    const opening = {
      ...streamedMessage,
      id: "opening",
      metadata: undefined
    };
    const undatedUser = { ...userMessage, metadata: undefined };
    const assistantReply = {
      ...streamedMessage,
      metadata: {
        ...streamedMessage.metadata,
        createdAt: new Date(2026, 6, 10, 11).toISOString()
      }
    };

    expect(
      chatDateDividerLabel([opening, undatedUser, assistantReply], 2, today)
    ).toBeNull();
  });

  it("starts a new divider when the next dated message is on another day", () => {
    const today = new Date(2026, 6, 10, 12);
    const yesterdayAssistant = {
      ...streamedMessage,
      metadata: {
        ...streamedMessage.metadata,
        createdAt: new Date(2026, 6, 9, 22).toISOString()
      }
    };
    const undatedUser = { ...userMessage, metadata: undefined };
    const todayAssistant = {
      ...streamedMessage,
      id: "assistant_2",
      metadata: {
        ...streamedMessage.metadata,
        createdAt: new Date(2026, 6, 10, 8).toISOString()
      }
    };
    const messages = [yesterdayAssistant, undatedUser, todayAssistant];

    expect(chatDateDividerLabel(messages, 0, today)).toBe("Yesterday");
    expect(chatDateDividerLabel(messages, 2, today)).toBe("Today");
  });

  it("renders streamed text parts with inspectable memory citations", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryMessage, {
        message: streamedMessage,
        onOpenInbox: () => undefined,
        onOpenMemory: async () => undefined
      })
    );

    expect(html).toContain("Your vault says you prefer concise help.");
    expect(html).toContain("[1]");
    expect(html).toMatch(/class="inline-citation"[^>]*>1<\/button>/);
    expect(html).toContain('aria-label="Citation 1: Prefers concise help"');
    expect(html).toContain("Prefers concise help");
    expect(html).toContain("Memory retrieval");
    expect(html).toContain('<details class="message-evidence">');
    expect(html).toContain("1 memory");
    expect(html).not.toContain('<details class="message-evidence" open');
  });

  it("renders assistant markdown without leaking raw formatting markers", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryMessage, {
        message: markdownMessage,
        onOpenInbox: () => undefined,
        onOpenMemory: async () => undefined
      })
    );

    expect(html).toContain("<strong>Remember durable things</strong>");
    expect(html).toContain("<li>");
    expect(html).toContain("<code>privacy boundaries</code>");
    expect(html).toContain("Prefers concise help");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("**Remember durable things**");
  });

  it("renders thread history titles, fallback previews, selected state, and pagination", () => {
    const html = renderToStaticMarkup(
      createElement(ChatThreadHistory, {
        isDraftNewThread: false,
        onPageChange: () => undefined,
        onRenameThread: async () => undefined,
        onSelectThread: async () => undefined,
        pagination: {
          page: 1,
          limit: 10,
          total: 12,
          totalPages: 2
        },
        selectedThreadId: "session_1",
        threads: [
          {
            sessionId: "session_1",
            title: "Planning conversations",
            titleLocked: false,
            messageCount: 4,
            lastMessagePreview: "We should plan the next feature.",
            createdAt: "2026-06-29T12:00:00.000Z",
            updatedAt: "2026-06-29T12:30:00.000Z"
          },
          {
            sessionId: "session_2",
            title: null,
            titleLocked: false,
            messageCount: 2,
            lastMessagePreview: "Fallback preview text",
            createdAt: "2026-06-29T11:00:00.000Z",
            updatedAt: "2026-06-29T11:20:00.000Z"
          }
        ]
      })
    );

    expect(html).toContain("Planning conversations");
    expect(html).toContain("Fallback preview text");
    expect(html).toContain("4 messages");
    expect(html).toContain("1 of 2");
    expect(html).toContain('data-selected="true"');
  });

  it("builds draft stream request bodies with startNewThread and no session id", () => {
    const body = buildChatStreamRequestBody({
      isDraftNewThread: true,
      messageId: "message_submit",
      messages: [streamedMessage, userMessage],
      sessionId: "stale_session",
      trigger: "submit-message"
    });

    expect(body.sessionId).toBeUndefined();
    expect(body.startNewThread).toBe(true);
    expect(body.message).toBe("Start a new thread from the overview composer.");
    expect(body.messageId).toBe("message_submit");
    expect(body.messages).toHaveLength(2);
    expect(body.messages.at(-1)?.parts).toEqual([
      {
        type: "text",
        text: "Start a new thread from the overview composer."
      }
    ]);
  });

  it("builds existing-thread stream request bodies without startNewThread", () => {
    const body = buildChatStreamRequestBody({
      isDraftNewThread: false,
      messageId: "message_submit",
      messages: [userMessage],
      sessionId: "session_1",
      trigger: "submit-message"
    });

    expect(body.sessionId).toBe("session_1");
    expect(body.startNewThread).toBeUndefined();
  });

  it("guards pending initial messages so each overview send is consumed once", () => {
    const pending = {
      id: "overview_1",
      text: "Start from Overview",
      startNewThread: true as const
    };

    expect(
      shouldConsumePendingInitialMessage({
        consumedPendingIds: new Set(),
        isStreaming: false,
        pendingInitialMessage: pending
      })
    ).toBe(true);
    expect(
      shouldConsumePendingInitialMessage({
        consumedPendingIds: new Set(["overview_1"]),
        isStreaming: false,
        pendingInitialMessage: pending
      })
    ).toBe(false);
    expect(
      shouldConsumePendingInitialMessage({
        consumedPendingIds: new Set(),
        isStreaming: true,
        pendingInitialMessage: pending
      })
    ).toBe(false);
    expect(
      shouldConsumePendingInitialMessage({
        consumedPendingIds: new Set(),
        isStreaming: false,
        pendingInitialMessage: null
      })
    ).toBe(false);
  });

  it("normalizes thread rename input before submitting", () => {
    expect(normalizeThreadRenameTitle("  Planning conversations  ")).toBe(
      "Planning conversations"
    );
    expect(normalizeThreadRenameTitle("   ")).toBe("");
  });
});

function renderToStaticMarkup(children: ReactNode) {
  return renderStatic(
    <ApiProvider apiUrl="http://api">{children}</ApiProvider>
  );
}
