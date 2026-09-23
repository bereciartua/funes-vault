"use client";
import { useEffect } from "react";

import { Button } from "../components/ui/button";

export default function Error({
  reset,
  error
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Funes Vault render failed", error);
  }, [error]);

  return (
    <main className="auth-panel" aria-label="Application error">
      <div>
        <p className="eyebrow">Funes Vault</p>
        <h1>Something went wrong</h1>
      </div>
      <p className="muted">
        The local app hit an unexpected rendering problem. Your vault data stays
        on the server.
      </p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
