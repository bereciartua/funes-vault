"use client";
import {
  authResponseSchema,
  type AuthUser,
  loginOptionsSchema,
  okResponseSchema
} from "@funes-vault/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../lib/api/api-client";
import { useApiUrl } from "../lib/api/api-context";
import { apiQueryKey, queryKeys } from "../lib/api/query-keys";
import { useApiMutation, useApiQuery } from "../lib/api/use-api";
import { readOfflineOwner, rememberOfflineOwner } from "./offline-owner";
import { useReachability } from "./use-reachability";

const sessionSchema = authResponseSchema.extend({
  user: authResponseSchema.shape.user.nullable()
});

export function useSession() {
  const apiUrl = useApiUrl();
  const client = useQueryClient();
  const reachability = useReachability();
  const [offlineOwnerId, setOfflineOwnerId] = useState<string | null>(null);
  useEffect(() => setOfflineOwnerId(readOfflineOwner(apiUrl)), [apiUrl]);
  const session = useApiQuery({
    key: queryKeys.session,
    path: "/auth/me",
    schema: sessionSchema
  });
  const refetchSession = session.refetch;
  const previousReachability = useRef(reachability.reachability);
  useEffect(() => {
    if (
      previousReachability.current === "unreachable" &&
      reachability.reachability === "reachable"
    ) {
      void refetchSession();
    }
    previousReachability.current = reachability.reachability;
  }, [reachability.reachability, refetchSession]);
  const setUser = useCallback(
    (user: AuthUser | null) => {
      rememberOfflineOwner(apiUrl, user?.id ?? null);
      setOfflineOwnerId(user?.id ?? null);
      client.setQueryData(apiQueryKey(apiUrl, queryKeys.session), { user });
    },
    [apiUrl, client]
  );
  const replaceOwner = useCallback(
    async (user: AuthUser | null) => {
      await client.cancelQueries();
      // Preserve the observed session query so expiration updates the auth gate
      // even when no mutation or navigation triggers another render.
      client.removeQueries({
        predicate: (query) =>
          !(query.queryKey[0] === apiUrl && query.queryKey[1] === "session")
      });
      client.getMutationCache().clear();
      setUser(user);
    },
    [apiUrl, client, setUser]
  );
  const clearSession = useCallback(() => replaceOwner(null), [replaceOwner]);
  useEffect(() => {
    const expired = () => {
      void clearSession();
    };
    window.addEventListener("funes-vault:session-expired", expired);

    return () =>
      window.removeEventListener("funes-vault:session-expired", expired);
  }, [clearSession]);
  const user = session.data?.user ?? null;
  useEffect(() => {
    if (session.isSuccess) {
      rememberOfflineOwner(apiUrl, user?.id ?? null);
      setOfflineOwnerId(user?.id ?? null);
    }
  }, [apiUrl, session.isSuccess, user?.id]);
  const unreachable =
    reachability.reachability === "unreachable" ||
    (session.error instanceof ApiError && session.error.kind === "unreachable");
  const status = user
    ? "authenticated"
    : unreachable
      ? "unreachable"
      : session.isPending
        ? "checking"
        : "anonymous";
  const options = useApiQuery({
    key: queryKeys.loginOptions,
    path: "/auth/options",
    schema: loginOptionsSchema,
    enabled: status === "anonymous"
  });
  const demo = useApiMutation({
    path: "/auth/demo",
    schema: authResponseSchema,
    onSuccess: (data) => replaceOwner(data.user)
  });
  const logoutRequest = useApiMutation({
    path: "/auth/logout",
    schema: okResponseSchema
  });
  const logout = async () => {
    try {
      await logoutRequest.mutateAsync();
    } catch {
      /* Local sign-out also works when the host is unreachable. */
    } finally {
      await clearSession();
    }
  };
  const retry = async () => {
    await reachability.retry();
    await session.refetch();
  };

  return {
    user,
    offlineOwnerId,
    reachability,
    status,
    setUser,
    logout,
    retry,
    isRetrying: session.isFetching,
    demoLoginEnabled: options.data?.demoLoginEnabled ?? false,
    demoLogin: () => demo.mutateAsync(),
    isDemoLoading: demo.isPending,
    error: demo.error
  };
}
