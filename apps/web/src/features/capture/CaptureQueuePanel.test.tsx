import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "../../test/render";
import type { QueuedCapture } from "./capture-queue";

const queue = vi.hoisted(() => ({
  addCapture: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  clearSynced: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  captures: [] as QueuedCapture[],
  isSyncing: false,
  refresh: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  removeCapture: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  summary: { pending: 0, synced: 0, failed: 0 },
  sync: vi.fn<() => Promise<null>>(() => Promise.resolve(null))
}));

vi.mock("./use-capture-queue", () => ({
  useCaptureQueue: () => queue
}));

import { CaptureQueuePanel } from "./CaptureQueuePanel";

afterEach(() => {
  cleanup();
  queue.addCapture.mockClear();
  queue.clearSynced.mockClear();
  queue.removeCapture.mockClear();
  queue.sync.mockClear();
  queue.captures = [];
  queue.isSyncing = false;
  queue.summary = { pending: 0, synced: 0, failed: 0 };
});

describe("CaptureQueuePanel", () => {
  it("queues trimmed capture text from the form", async () => {
    const user = userEvent.setup();
    render(<CaptureQueuePanel />);

    await user.type(screen.getByLabelText("Capture"), "  Remember this  ");
    await user.click(screen.getByRole("button", { name: "Queue capture" }));

    await waitFor(() =>
      expect(queue.addCapture).toHaveBeenCalledWith("Remember this")
    );
  });

  it("renders pending captures and removal controls", async () => {
    queue.captures = [
      {
        captureId: "capture_1",
        text: "Queued while the vault was offline",
        capturedAt: "2026-07-09T12:00:00.000Z",
        status: "pending",
        error: "Vault unreachable. Will retry when it is back.",
        attempts: 1,
        suggestionId: null
      }
    ];
    queue.summary = { pending: 1, synced: 0, failed: 0 };

    const user = userEvent.setup();
    render(<CaptureQueuePanel />);

    expect(screen.getByText("Queued while the vault was offline")).toBeTruthy();
    expect(screen.getByText("1 pending capture")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Remove capture from this device" })
    );

    expect(queue.removeCapture).toHaveBeenCalledWith("capture_1");
  });
});
