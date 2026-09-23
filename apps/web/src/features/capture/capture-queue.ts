import { captureResponseSchema } from "@funes-vault/shared";

import { randomId } from "../../lib/random-id";

// Device-local quick-capture queue. Captures are stored in IndexedDB so the
// "remember this" use case works while the vault is unreachable (network offline,
// server unavailable) and sync through POST /v1/captures once it is reachable
// again. The captureId doubles as the server-side idempotency key, so a
// sync interrupted mid-flight can safely retry.

type CaptureStatus = "pending" | "synced" | "failed";

export type QueuedCapture = {
  captureId: string;
  text: string;
  capturedAt: string;
  status: CaptureStatus;
  error: string | null;
  attempts: number;
  suggestionId: string | null;
};

export type CaptureStore = {
  all(): Promise<QueuedCapture[]>;
  put(capture: QueuedCapture): Promise<void>;
  remove(captureId: string): Promise<void>;
};

export function newCapture(
  text: string,
  options: { captureId?: string; now?: Date } = {}
): QueuedCapture {
  return {
    captureId: options.captureId ?? randomId(),
    text: text.trim(),
    capturedAt: (options.now ?? new Date()).toISOString(),
    status: "pending",
    error: null,
    attempts: 0,
    suggestionId: null
  };
}

export function pendingCaptures(captures: QueuedCapture[]) {
  return captures
    .filter((capture) => capture.status === "pending")
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export function captureQueueSummary(captures: QueuedCapture[]) {
  return {
    pending: captures.filter((capture) => capture.status === "pending").length,
    synced: captures.filter((capture) => capture.status === "synced").length,
    failed: captures.filter((capture) => capture.status === "failed").length
  };
}

type SyncFailure = {
  kind: "unreachable" | "unauthorized" | "rejected" | "server";
  message: string;
};

// 4xx responses (other than auth) mean the vault looked at the capture and
// refused it — retrying will not help, so the capture is marked failed and
// kept visible. Network errors, auth errors, and 5xx keep the capture
// pending for a later sync.
export function classifySyncFailure(status: number | null): SyncFailure {
  if (status === null) {
    return {
      kind: "unreachable",
      message: "Vault unreachable. Will retry when it is back."
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: "unauthorized",
      message: "Sign in to the vault to sync this capture."
    };
  }

  if (status >= 500) {
    return {
      kind: "server",
      message: "The vault had a problem. Will retry."
    };
  }

  return {
    kind: "rejected",
    message: "The vault rejected this capture."
  };
}

export type SyncOutcome = {
  synced: number;
  failed: number;
  stopped: "completed" | "unreachable" | "unauthorized";
};

export async function syncCaptures(input: {
  store: CaptureStore;
  apiUrl: string;
  fetchImpl?: typeof fetch;
  ownerId?: string;
  signal?: AbortSignal;
}): Promise<SyncOutcome> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const queue = pendingCaptures(await input.store.all());
  let synced = 0;
  let failed = 0;

  for (const capture of queue) {
    let response: Response;

    try {
      response = await fetchImpl(`${input.apiUrl}/v1/captures`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(input.ownerId ? { "x-funes-owner-id": input.ownerId } : {})
        },
        signal: input.signal,
        credentials: "include",
        body: JSON.stringify({
          text: capture.text,
          captureId: capture.captureId,
          capturedAt: capture.capturedAt
        })
      });
    } catch {
      const failure = classifySyncFailure(null);
      await input.store.put({
        ...capture,
        attempts: capture.attempts + 1,
        error: failure.message
      });

      return { synced, failed, stopped: "unreachable" };
    }

    if (!response.ok) {
      const failure = classifySyncFailure(response.status);
      const nextStatus: CaptureStatus =
        failure.kind === "rejected" ? "failed" : "pending";
      let message = failure.message;

      if (failure.kind === "rejected") {
        message = (await rejectionMessage(response)) ?? failure.message;
        failed += 1;
      }

      await input.store.put({
        ...capture,
        status: nextStatus,
        attempts: capture.attempts + 1,
        error: message
      });

      if (failure.kind === "unauthorized") {
        return { synced, failed, stopped: "unauthorized" };
      }
      if (failure.kind === "server") {
        return { synced, failed, stopped: "unreachable" };
      }
      continue;
    }

    const parsed = captureResponseSchema.safeParse(await safeJson(response));
    await input.store.put({
      ...capture,
      status: "synced",
      error: null,
      attempts: capture.attempts + 1,
      suggestionId: parsed.success ? parsed.data.suggestionId : null
    });
    synced += 1;
  }

  return { synced, failed, stopped: "completed" };
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function rejectionMessage(response: Response) {
  const body = await safeJson(response);

  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
    if (Array.isArray(message) && typeof message[0] === "string") {
      return message[0];
    }
  }

  return null;
}

export async function clearSyncedCaptures(store: CaptureStore) {
  const captures = await store.all();
  await Promise.all(
    captures
      .filter((capture) => capture.status === "synced")
      .map((capture) => store.remove(capture.captureId))
  );
}

export function createMemoryCaptureStore(
  initial: QueuedCapture[] = []
): CaptureStore {
  const items = new Map(initial.map((item) => [item.captureId, { ...item }]));

  return {
    all: () =>
      Promise.resolve([...items.values()].map((item) => ({ ...item }))),
    put: (capture) => {
      items.set(capture.captureId, { ...capture });

      return Promise.resolve();
    },
    remove: (captureId) => {
      items.delete(captureId);

      return Promise.resolve();
    }
  };
}

const captureDbName = "funes-capture-queue";
const captureStoreName = "captures";

function openCaptureDatabase(scope: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`${captureDbName}:${scope}`, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(captureStoreName)) {
        request.result.createObjectStore(captureStoreName, {
          keyPath: "captureId"
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

export function createIndexedDbCaptureStore(scope: string): CaptureStore {
  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await openCaptureDatabase(scope);
    try {
      const transaction = db.transaction(captureStoreName, mode);

      return await requestToPromise(
        run(transaction.objectStore(captureStoreName))
      );
    } finally {
      db.close();
    }
  }

  return {
    all: () =>
      withStore(
        "readonly",
        (store) => store.getAll() as IDBRequest<QueuedCapture[]>
      ),
    put: async (capture) => {
      await withStore("readwrite", (store) => store.put(capture));
    },
    remove: async (captureId) => {
      await withStore("readwrite", (store) => store.delete(captureId));
    }
  };
}
