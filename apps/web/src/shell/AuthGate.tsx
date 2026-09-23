"use client";
import "./shell.css";

import type { AuthResponse } from "@funes-vault/shared";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useContext, useRef } from "react";

import { ApiProvider, useApiUrl } from "../lib/api/api-context";
import { errorCopy } from "../lib/api/error-copy";
import { AuthForm } from "./AuthForm";
import { PublicHome } from "./PublicHome";
import { useSession } from "./use-session";
import { VaultUnreachable } from "./VaultUnreachable";

type Status = "checking" | "anonymous" | "authenticated" | "unreachable";
const SessionContext = createContext<ReturnType<typeof useSession> | null>(
  null
);
export function useVaultSession() {
  const session = useContext(SessionContext);
  if (!session?.user) {
    throw new Error("Vault features require an authenticated session");
  }

  return { ...session, user: session.user };
}

export function authPanelSurface(
  status: Status,
  user: AuthResponse["user"] | null
) {
  if (status === "checking") {
    return "checking";
  }

  if (status === "unreachable") {
    return "unreachable";
  }

  if (status === "authenticated" && user) {
    return "authenticated";
  }

  return "anonymous";
}

export function AuthGate({ children }: { children: ReactNode }) {
  const apiUrl = useApiUrl();
  const session = useSession();
  const searchParams = useSearchParams();
  const authFormRef = useRef<HTMLAnchorElement>(null);
  const returnTo = usePathname();
  const loginUrl = `${apiUrl.replace(/\/$/, "")}/auth/google?${new URLSearchParams({ returnTo: returnTo === "/" ? "/vault" : returnTo })}`;
  const error = searchParams.has("authError")
    ? "Google sign-in was canceled or could not be completed. Please try again."
    : session.error
      ? errorCopy(
          session.error,
          "Could not open the demo vault. Please try again."
        )
      : null;
  if (session.status === "checking") {
    return (
      <section className="auth-panel" aria-label="Authentication">
        <p>Checking session...</p>
      </section>
    );
  }
  if (session.status === "unreachable") {
    return (
      <ApiProvider
        key={`${apiUrl}:${session.offlineOwnerId ?? "offline"}`}
        apiUrl={apiUrl}
        ownerId={session.offlineOwnerId}
      >
        <VaultUnreachable
          isRetrying={session.isRetrying}
          onRetry={() => void session.retry()}
        />
      </ApiProvider>
    );
  }
  if (session.user) {
    return (
      <SessionContext.Provider
        key={`${apiUrl}:${session.user.id}`}
        value={session}
      >
        <ApiProvider apiUrl={apiUrl} ownerId={session.user.id}>
          {children}
        </ApiProvider>
      </SessionContext.Provider>
    );
  }

  return (
    <PublicHome
      authForm={
        <AuthForm
          ref={authFormRef}
          error={error}
          loginUrl={loginUrl}
          onDemoLogin={
            session.demoLoginEnabled
              ? () => {
                  void session.demoLogin().catch(() => undefined);
                }
              : undefined
          }
          isDemoLoading={session.isDemoLoading}
        />
      }
      onSignIn={({ focus = true } = {}) => {
        if (focus) {
          window.requestAnimationFrame(() => authFormRef.current?.focus());
        }
      }}
      showAuth={Boolean(error)}
    />
  );
}
