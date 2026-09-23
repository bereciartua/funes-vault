"use client";
import { createContext, type ReactNode, useContext, useState } from "react";

type Launch =
  { id: string; text: string; startNewThread: true } | { voice: true } | null;
const LaunchContext = createContext<{
  pending: Launch;
  providerNotice: string | null;
  setProviderNotice: (notice: string | null) => void;
  setPending: (launch: Launch) => void;
} | null>(null);
export function ChatLaunchProvider({ children }: { children: ReactNode }) {
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Launch>(null);

  return (
    <LaunchContext.Provider
      value={{ pending, setPending, providerNotice, setProviderNotice }}
    >
      {children}
    </LaunchContext.Provider>
  );
}
export function useChatLaunch() {
  const launch = useContext(LaunchContext);
  if (!launch) {
    throw new Error("useChatLaunch requires ChatLaunchProvider");
  }

  return launch;
}
