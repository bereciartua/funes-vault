"use client";
import { useSyncExternalStore } from "react";
import { z } from "zod";

import { queryKeys } from "../lib/api/query-keys";
import { useApiQuery } from "../lib/api/use-api";

const healthSchema = z.object({ status: z.string() });
function subscribeOnline(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);

  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

/** Shared query observers use one health request and one reachability state. */
export function useReachability() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const query = useApiQuery({
    key: queryKeys.reachability,
    path: "/health",
    schema: healthSchema,
    refetchInterval: online ? 30_000 : false
  });

  return {
    reachability:
      !online || query.isError
        ? ("unreachable" as const)
        : ("reachable" as const),
    isChecking: query.isFetching,
    retry: query.refetch
  };
}
