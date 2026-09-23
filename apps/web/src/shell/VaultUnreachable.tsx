"use client";
import { RefreshCw, WifiOff } from "lucide-react";

import { Button } from "../components/ui/button";
import { CaptureQueuePanel } from "../features/capture/CaptureQueuePanel";
import { useApiOwner } from "../lib/api/api-context";

export function VaultUnreachableView({
  isRetrying,
  onRetry,
  capturePanel
}: {
  isRetrying: boolean;
  onRetry: () => void;
  capturePanel?: React.ReactNode;
}) {
  return (
    <section className="unreachable-panel" aria-label="Vault unreachable">
      <div className="unreachable-heading">
        <WifiOff aria-hidden="true" size={28} strokeWidth={2.2} />
        <div>
          <h1>Your vault is unreachable</h1>
          <p>
            Funes cannot reach your server right now. Check your connection or
            try again when the server is available.
          </p>
        </div>
      </div>
      <ul className="unreachable-checklist">
        <li>Check your internet connection.</li>
        <li>
          If other websites work, your Funes server may be temporarily
          unavailable.
        </li>
        <li>
          Pending text captures stay on this device until they sync. Keep
          browser data until the queue confirms they are saved.
        </li>
      </ul>
      <div className="unreachable-actions">
        <Button type="button" disabled={isRetrying} onClick={onRetry}>
          <RefreshCw aria-hidden="true" size={16} strokeWidth={2.5} />
          {isRetrying ? "Checking..." : "Try again"}
        </Button>
        <span className="muted" aria-live="polite">
          {isRetrying ? "Contacting your vault..." : "Retrying automatically."}
        </span>
      </div>
      {capturePanel}
    </section>
  );
}

export function VaultUnreachable({
  isRetrying,
  onRetry
}: {
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const ownerId = useApiOwner();

  return (
    <VaultUnreachableView
      isRetrying={isRetrying}
      onRetry={onRetry}
      capturePanel={
        ownerId ? (
          <CaptureQueuePanel />
        ) : (
          <p>
            Sign in when the server is available to open your private capture
            queue.
          </p>
        )
      }
    />
  );
}
