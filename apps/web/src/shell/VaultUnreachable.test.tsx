import { createElement } from "react";
import { describe, expect, it } from "vitest";

import type { QueuedCapture } from "../features/capture/capture-queue";
import {
  CaptureQueueList,
  captureStatusDescriptor
} from "../features/capture/CaptureQueuePanel";
import { renderToStaticMarkup } from "../test/render";
import { authPanelSurface } from "./AuthGate";
import { VaultStatusBarView } from "./VaultStatusBar";
import { VaultUnreachableView } from "./VaultUnreachable";

function capture(overrides: Partial<QueuedCapture> = {}): QueuedCapture {
  return {
    captureId: "capture-1",
    text: "Remember the retainer question.",
    capturedAt: "2026-07-03T08:00:00.000Z",
    status: "pending",
    error: null,
    attempts: 0,
    suggestionId: null,
    ...overrides
  };
}

describe("unreachable vault state", () => {
  it("is a dedicated auth surface", () => {
    expect(authPanelSurface("unreachable", null)).toBe("unreachable");
  });

  it("explains the situation and offers retry plus offline capture", () => {
    const html = renderToStaticMarkup(
      createElement(VaultUnreachableView, {
        isRetrying: false,
        onRetry: () => undefined,
        capturePanel: createElement("div", null, "capture-panel-slot")
      })
    );

    expect(html).toContain("Your vault is unreachable");
    expect(html).toContain("Check your internet connection");
    expect(html).toContain("Try again");
    expect(html).toContain("Retrying automatically.");
    expect(html).toContain("capture-panel-slot");
  });

  it("shows checking state while a retry is in flight", () => {
    const html = renderToStaticMarkup(
      createElement(VaultUnreachableView, {
        isRetrying: true,
        onRetry: () => undefined
      })
    );

    expect(html).toContain("Checking...");
    expect(html).toContain("Contacting your vault...");
  });
});

describe("capture queue rendering", () => {
  it("maps capture statuses to visible pending, synced, and failed states", () => {
    expect(captureStatusDescriptor(capture()).label).toBe("Waiting to sync");
    expect(captureStatusDescriptor(capture({ status: "synced" })).label).toBe(
      "Synced for review"
    );
    expect(captureStatusDescriptor(capture({ status: "failed" })).label).toBe(
      "Rejected"
    );
  });

  it("renders queued captures with status and errors", () => {
    const html = renderToStaticMarkup(
      createElement(CaptureQueueList, {
        captures: [
          capture(),
          capture({
            captureId: "capture-2",
            status: "failed",
            error: "The vault rejected this capture."
          })
        ],
        onRemove: () => undefined
      })
    );

    expect(html).toContain("Remember the retainer question.");
    expect(html).toContain("Waiting to sync");
    expect(html).toContain("Rejected");
    expect(html).toContain("The vault rejected this capture.");
  });

  it("renders an empty state", () => {
    const html = renderToStaticMarkup(
      createElement(CaptureQueueList, {
        captures: [],
        onRemove: () => undefined
      })
    );

    expect(html).toContain("No captures on this device.");
  });
});

describe("vault status bar", () => {
  const baseProps = {
    isChecking: false,
    isSyncing: false,
    onRetry: () => undefined,
    onSync: () => undefined
  };

  it("renders nothing while reachable with an empty queue", () => {
    const html = renderToStaticMarkup(
      createElement(VaultStatusBarView, {
        ...baseProps,
        reachability: "reachable" as const,
        pendingCaptures: 0,
        failedCaptures: 0
      })
    );

    expect(html).toBe("");
  });

  it("shows the unreachable banner with retry and pending capture count", () => {
    const html = renderToStaticMarkup(
      createElement(VaultStatusBarView, {
        ...baseProps,
        reachability: "unreachable" as const,
        pendingCaptures: 2,
        failedCaptures: 0
      })
    );

    expect(html).toContain("Vault unreachable");
    expect(html).toContain("2 captures will sync on reconnect.");
    expect(html).toContain("Retry");
  });

  it("shows queued captures with a sync action while reachable", () => {
    const html = renderToStaticMarkup(
      createElement(VaultStatusBarView, {
        ...baseProps,
        reachability: "reachable" as const,
        pendingCaptures: 1,
        failedCaptures: 0
      })
    );

    expect(html).toContain("1 queued capture");
    expect(html).toContain("Sync now");
  });
});
