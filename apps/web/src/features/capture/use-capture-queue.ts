"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useApiOwner, useApiUrl } from "../../lib/api/api-context";
import {
  captureQueueSummary,
  clearSyncedCaptures,
  createIndexedDbCaptureStore,
  createMemoryCaptureStore,
  hasIndexedDb,
  newCapture,
  type QueuedCapture,
  syncCaptures,
  type SyncOutcome
} from "./capture-queue";

export function useCaptureQueue(input: {
  onSynced?: (outcome: SyncOutcome) => void;
}) {
  const { onSynced } = input;
  const apiUrl = useApiUrl();
  const ownerId = useApiOwner();
  const abort = useRef(new AbortController());
  useEffect(() => {
    abort.current = new AbortController();

    return () => abort.current.abort();
  }, [apiUrl, ownerId]);
  const store = useMemo(
    () =>
      hasIndexedDb() && ownerId
        ? createIndexedDbCaptureStore(JSON.stringify([apiUrl, ownerId]))
        : createMemoryCaptureStore(),
    [apiUrl, ownerId]
  );
  const [captures, setCaptures] = useState<QueuedCapture[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const refresh = useCallback(async () => {
    const items = await store.all();
    setCaptures(
      [...items].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    );
  }, [store]);

  const sync = useCallback(async () => {
    if (!ownerId || abort.current.signal.aborted || isSyncingRef.current) {
      return null;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const outcome = await syncCaptures({
        store,
        apiUrl,
        ownerId,
        signal: abort.current.signal
      });
      await refresh();
      if (outcome.synced > 0) {
        onSyncedRef.current?.(outcome);
      }

      return outcome;
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [apiUrl, ownerId, abort, refresh, store]);

  const addCapture = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      await store.put(newCapture(trimmed));
      await refresh();
      void sync();
    },
    [refresh, store, sync]
  );

  const removeCapture = useCallback(
    async (captureId: string) => {
      await store.remove(captureId);
      await refresh();
    },
    [refresh, store]
  );

  const clearSynced = useCallback(async () => {
    await clearSyncedCaptures(store);
    await refresh();
  }, [refresh, store]);

  useEffect(() => {
    void refresh().then(() => void sync());

    function handleOnline() {
      void sync();
    }

    window.addEventListener("online", handleOnline);

    return () => window.removeEventListener("online", handleOnline);
  }, [refresh, sync]);

  return {
    captures,
    summary: captureQueueSummary(captures),
    isSyncing,
    addCapture,
    removeCapture,
    clearSynced,
    sync,
    refresh
  };
}
