import type { ReactNode } from "react";

import { TooltipProvider } from "../components/ui/tooltip";
import { ApiProvider, createQueryClient } from "../lib/api/api-context";
export const testApiUrl = "http://vault.test";
export function queryWrapper() {
  const client = createQueryClient();
  client.setDefaultOptions({
    queries: { retry: false, gcTime: 0, staleTime: 30_000 },
    mutations: { retry: false, gcTime: 0 }
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TooltipProvider>
      <ApiProvider apiUrl={testApiUrl} client={client}>
        {children}
      </ApiProvider>
    </TooltipProvider>
  );

  return { client, wrapper };
}
