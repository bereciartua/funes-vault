"use client";
import { RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";

import { Button } from "../components/ui/button";
import { StatusBadge } from "../components/ui/status-badge";
import type { SyncOutcome } from "../features/capture/capture-queue";
import { CaptureQueuePanelView } from "../features/capture/CaptureQueuePanel";
import { useCaptureQueue } from "../features/capture/use-capture-queue";
import { pluralize } from "../lib/text";
import { useVaultSession } from "./AuthGate";

type Reachability = "reachable" | "unreachable";

export function VaultStatusBarView({
  reachability,
  isChecking,
  pendingCaptures,
  failedCaptures,
  isSyncing,
  onRetry,
  onSync
}: {
  reachability: Reachability;
  isChecking: boolean;
  pendingCaptures: number;
  failedCaptures: number;
  isSyncing: boolean;
  onRetry: () => void;
  onSync: () => void;
}) {
  if (
    reachability === "reachable" &&
    pendingCaptures === 0 &&
    failedCaptures === 0
  ) {
    return null;
  }

  if (reachability === "unreachable") {
    return (
      <div className="vault-status-bar" role="alert" data-tone="unreachable">
        <div className="vault-status-copy">
          <WifiOff aria-hidden="true" size={16} strokeWidth={2.4} />
          <span>
            Vault unreachable — check your connection. Changes cannot load or
            save right now.
            {pendingCaptures > 0
              ? ` ${pluralize(pendingCaptures, "capture")} will sync on reconnect.`
              : ""}
          </span>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={isChecking}
          onClick={onRetry}
        >
          <RefreshCw aria-hidden="true" size={14} strokeWidth={2.5} />
          {isChecking ? "Checking..." : "Retry"}
        </Button>
      </div>
    );
  }

  return (
    <div className="vault-status-bar" role="status" data-tone="captures">
      <div className="vault-status-copy">
        <StatusBadge
          descriptor={{
            icon: failedCaptures > 0 ? "OctagonAlert" : "Clock3",
            label:
              failedCaptures > 0
                ? pluralize(failedCaptures, "rejected capture")
                : pluralize(pendingCaptures, "queued capture"),
            tone: failedCaptures > 0 ? "danger" : "attention"
          }}
        />
        <span>
          {failedCaptures > 0
            ? "Some offline captures were rejected. Review them from the unreachable screen or remove them."
            : "Offline captures are waiting to sync into your suggestion inbox."}
        </span>
      </div>
      {pendingCaptures > 0 ? (
        <Button
          type="button"
          variant="secondary"
          disabled={isSyncing}
          onClick={onSync}
        >
          <RefreshCw aria-hidden="true" size={14} strokeWidth={2.5} />
          {isSyncing ? "Syncing..." : "Sync now"}
        </Button>
      ) : null}
    </div>
  );
}

export function VaultStatusBar({
  onCapturesSynced,
  onReconnected
}: {
  onCapturesSynced?: (outcome: SyncOutcome) => void;
  onReconnected?: () => void;
}) {
  const {
    reachability: { reachability, isChecking, retry }
  } = useVaultSession();
  const queue = useCaptureQueue({ onSynced: onCapturesSynced });
  const previous = useRef(reachability);
  const reconnected = useEffectEvent(() => {
    onReconnected?.();
    void queue.sync();
  });
  useEffect(() => {
    if (previous.current === "unreachable" && reachability === "reachable") {
      reconnected();
    }
    previous.current = reachability;
  }, [reachability]);

  return (
    <>
      <VaultStatusBarView
        reachability={reachability}
        isChecking={isChecking}
        pendingCaptures={queue.summary.pending}
        failedCaptures={queue.summary.failed}
        isSyncing={queue.isSyncing}
        onRetry={() => void retry()}
        onSync={() => void queue.sync()}
      />
      {reachability === "unreachable" ? (
        <CaptureQueuePanelView queue={queue} />
      ) : null}
    </>
  );
}
