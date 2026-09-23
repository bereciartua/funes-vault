"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState
} from "react";

import { ConfirmationProvider } from "../../components/ui/confirmation-dialog";

const ApiContext = createContext<{
  apiUrl: string;
  ownerId: string | null;
} | null>(null);

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: true },
      mutations: { retry: false }
    }
  });
}

/** One cache per mounted vault. Session transitions clear it before another owner can render. */
export function ApiProvider({
  apiUrl,
  children,
  client,
  ownerId = null
}: {
  apiUrl: string;
  children: ReactNode;
  client?: QueryClient;
  ownerId?: string | null;
}) {
  const [queryClient] = useState(() => client ?? createQueryClient());

  useEffect(
    () => () => {
      void queryClient.cancelQueries();
      queryClient.clear();
    },
    [queryClient]
  );

  return (
    <ApiContext.Provider value={{ apiUrl, ownerId }}>
      <QueryClientProvider client={queryClient}>
        <ConfirmationProvider>{children}</ConfirmationProvider>
      </QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApiUrl() {
  const apiUrl = useContext(ApiContext);
  if (!apiUrl) {
    throw new Error("useApiUrl requires ApiProvider");
  }

  return apiUrl.apiUrl;
}

export function useApiOwner() {
  return useContext(ApiContext)?.ownerId ?? null;
}
