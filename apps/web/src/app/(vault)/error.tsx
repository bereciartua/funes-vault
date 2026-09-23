"use client";
import { useEffect } from "react";
export default function VaultError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Vault view failed", error.digest ?? error.name);
  }, [error]);

  return (
    <section role="alert">
      <h1>Could not open this view</h1>
      <p>
        Your saved vault data is still available. Try loading the view again.
      </p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
