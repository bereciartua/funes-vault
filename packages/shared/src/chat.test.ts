import { describe, expect, it } from "vitest";

import {
  chatMessageRequestSchema,
  chatThreadResponseSchema,
  chatThreadSummarySchema,
  listChatThreadsResponseSchema,
  renameChatThreadRequestSchema
} from "./index.js";

describe("chat thread schemas", () => {
  const threadSummary = {
    sessionId: "session_1",
    title: "Planning conversations",
    titleLocked: false,
    messageCount: 4,
    lastMessagePreview: "We should remember the implementation order.",
    createdAt: "2026-06-29T12:00:00.000Z",
    updatedAt: "2026-06-29T12:30:00.000Z"
  };

  it("validates thread summaries, lists, and detail responses", () => {
    expect(chatThreadSummarySchema.parse(threadSummary)).toEqual(threadSummary);
    expect(
      listChatThreadsResponseSchema.parse({
        items: [threadSummary],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1
        }
      }).items
    ).toHaveLength(1);
    expect(
      chatThreadResponseSchema.parse({
        sessionId: "session_1",
        title: null,
        titleLocked: false,
        messages: []
      }).sessionId
    ).toBe("session_1");
  });

  it("trims and bounds rename requests", () => {
    expect(
      renameChatThreadRequestSchema.parse({
        title: "  Planning conversations  "
      }).title
    ).toBe("Planning conversations");

    expect(() =>
      renameChatThreadRequestSchema.parse({ title: "   " })
    ).toThrow();
  });

  it("allows draft new-thread sends without a session id", () => {
    const parsed = chatMessageRequestSchema.parse({
      startNewThread: true,
      message: "What should future assistants know?"
    });

    expect(parsed.startNewThread).toBe(true);
    expect(parsed.sessionId).toBeUndefined();
  });

  it("rejects new-thread sends that also include a session id", () => {
    expect(() =>
      chatMessageRequestSchema.parse({
        sessionId: "session_1",
        startNewThread: true,
        message: "This should not be ambiguous."
      })
    ).toThrow();
  });
});
