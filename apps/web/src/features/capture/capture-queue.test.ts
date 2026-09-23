import { describe, expect, it, vi } from "vitest";

import {
  captureQueueSummary,
  classifySyncFailure,
  clearSyncedCaptures,
  createMemoryCaptureStore,
  newCapture,
  pendingCaptures,
  type QueuedCapture,
  syncCaptures
} from "./capture-queue";

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

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("capture queue", () => {
  it("creates trimmed pending captures with idempotency keys", () => {
    const created = newCapture("  Buy stamps  ", {
      captureId: "capture-9",
      now: new Date("2026-07-03T08:00:00.000Z")
    });

    expect(created).toEqual({
      captureId: "capture-9",
      text: "Buy stamps",
      capturedAt: "2026-07-03T08:00:00.000Z",
      status: "pending",
      error: null,
      attempts: 0,
      suggestionId: null
    });
    expect(newCapture("x").captureId).not.toBe(newCapture("x").captureId);
  });

  it("orders pending captures oldest-first for syncing", () => {
    const captures = [
      capture({ captureId: "b", capturedAt: "2026-07-03T09:00:00.000Z" }),
      capture({ captureId: "synced", status: "synced" }),
      capture({ captureId: "a", capturedAt: "2026-07-03T08:00:00.000Z" })
    ];

    expect(pendingCaptures(captures).map((item) => item.captureId)).toEqual([
      "a",
      "b"
    ]);
  });

  it("summarizes queue states", () => {
    expect(
      captureQueueSummary([
        capture({ captureId: "a" }),
        capture({ captureId: "b", status: "synced" }),
        capture({ captureId: "c", status: "failed" })
      ])
    ).toEqual({ pending: 1, synced: 1, failed: 1 });
  });

  it("keeps captures retryable on network, auth, and server failures but not rejections", () => {
    expect(classifySyncFailure(null).kind).toBe("unreachable");
    expect(classifySyncFailure(401).kind).toBe("unauthorized");
    expect(classifySyncFailure(503).kind).toBe("server");
    expect(classifySyncFailure(400).kind).toBe("rejected");
  });

  it("syncs pending captures through the capture endpoint and records suggestion ids", async () => {
    const store = createMemoryCaptureStore([capture()]);
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        suggestionId: "suggestion_1",
        status: "QUEUED_FOR_REVIEW",
        auditEventId: "audit_1",
        deduplicated: false
      })
    );

    const outcome = await syncCaptures({
      store,
      apiUrl: "http://localhost:4000",
      fetchImpl
    });

    expect(outcome).toEqual({ synced: 1, failed: 0, stopped: "completed" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:4000/v1/captures",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          text: "Remember the retainer question.",
          captureId: "capture-1",
          capturedAt: "2026-07-03T08:00:00.000Z"
        })
      })
    );

    const [synced] = await store.all();
    expect(synced?.status).toBe("synced");
    expect(synced?.suggestionId).toBe("suggestion_1");
  });

  it("stops syncing when the vault is unreachable and keeps captures pending", async () => {
    const store = createMemoryCaptureStore([
      capture({ captureId: "a", capturedAt: "2026-07-03T08:00:00.000Z" }),
      capture({ captureId: "b", capturedAt: "2026-07-03T09:00:00.000Z" })
    ]);
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const outcome = await syncCaptures({
      store,
      apiUrl: "http://localhost:4000",
      fetchImpl
    });

    expect(outcome.stopped).toBe("unreachable");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const items = await store.all();
    expect(items.every((item) => item.status === "pending")).toBe(true);
    expect(items.find((item) => item.captureId === "a")?.error).toContain(
      "unreachable"
    );
  });

  it("marks rejected captures failed with the server message and keeps syncing", async () => {
    const store = createMemoryCaptureStore([
      capture({ captureId: "a", capturedAt: "2026-07-03T08:00:00.000Z" }),
      capture({ captureId: "b", capturedAt: "2026-07-03T09:00:00.000Z" })
    ]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(400, { message: "Secret-like content detected" })
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          suggestionId: "suggestion_2",
          status: "QUEUED_FOR_REVIEW",
          auditEventId: "audit_2",
          deduplicated: false
        })
      );

    const outcome = await syncCaptures({
      store,
      apiUrl: "http://localhost:4000",
      fetchImpl
    });

    expect(outcome).toEqual({ synced: 1, failed: 1, stopped: "completed" });

    const items = await store.all();
    const rejected = items.find((item) => item.captureId === "a");
    expect(rejected?.status).toBe("failed");
    expect(rejected?.error).toBe("Secret-like content detected");
    expect(items.find((item) => item.captureId === "b")?.status).toBe("synced");
  });

  it("stops on auth failures so captures wait for a signed-in session", async () => {
    const store = createMemoryCaptureStore([capture()]);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, {}));

    const outcome = await syncCaptures({
      store,
      apiUrl: "http://localhost:4000",
      fetchImpl
    });

    expect(outcome.stopped).toBe("unauthorized");
    const [item] = await store.all();
    expect(item?.status).toBe("pending");
    expect(item?.error).toContain("Sign in");
  });

  it("clears only synced captures", async () => {
    const store = createMemoryCaptureStore([
      capture({ captureId: "a", status: "synced" }),
      capture({ captureId: "b" })
    ]);

    await clearSyncedCaptures(store);

    expect((await store.all()).map((item) => item.captureId)).toEqual(["b"]);
  });
});
