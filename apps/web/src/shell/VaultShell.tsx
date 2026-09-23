"use client";
import "./shell.css";

import type { ReactNode } from "react";

import { useOverview } from "../features/overview/use-overview";
import { queryKeys } from "../lib/api/query-keys";
import { useInvalidateQueries } from "../lib/api/use-api";
import { AppNav } from "./AppNav";
import { ChatLaunchProvider } from "./chat-launch";
import { VaultStatusBar } from "./VaultStatusBar";

export function VaultShell({ children }: { children: ReactNode }) {
  const overview = useOverview();
  const invalidate = useInvalidateQueries();
  const refresh = () => {
    void invalidate(
      queryKeys.overview,
      queryKeys.memories.all,
      queryKeys.suggestions.all
    );
  };

  return (
    <ChatLaunchProvider>
      <div className="shell">
        <div className="vault">
          <a className="skip-link" href="#app-main">
            Skip to content
          </a>
          <AppNav pendingSuggestions={overview.data?.suggestionTotal ?? 0} />
          <VaultStatusBar onCapturesSynced={refresh} onReconnected={refresh} />
          <main id="app-main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </ChatLaunchProvider>
  );
}
