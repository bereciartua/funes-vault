import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiProvider } from "../../../lib/api/api-context";
import { render } from "../../../test/render";
import { MemoryMessage } from "./MemoryMessage";
afterEach(cleanup);
it.each([false, true])(
  "shows one permission explanation with extraction denial: %s",
  (extraction) => {
    render(
      <ApiProvider apiUrl="http://vault.test">
        <MemoryMessage
          message={{
            id: "message",
            role: "assistant",
            parts: [
              {
                type: "data-tool-trace",
                data: {
                  toolCallId: "call",
                  toolName: "request_memory",
                  label: "Memory request",
                  status: "denied",
                  summary: "Denied",
                  metadata: { reason: "no_client_policy" }
                }
              }
            ],
            ...(extraction
              ? {
                  metadata: {
                    processing: {
                      status: "completed",
                      outcomes: [
                        { status: "DENIED", reason: "no_client_policy" }
                      ]
                    }
                  }
                }
              : {})
          }}
          onOpenInbox={vi.fn()}
          onOpenMemory={vi.fn()}
        />
      </ApiProvider>
    );
    expect(screen.getAllByText(/This app has no permissions/)).toHaveLength(1);
    expect(
      screen.getAllByRole("link", { name: "Manage App permissions" })
    ).toHaveLength(1);
  }
);
