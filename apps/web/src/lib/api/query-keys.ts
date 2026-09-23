import type { QueryKey } from "@tanstack/react-query";

type Filters = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;
export const queryKeys = {
  session: ["session"] as const,
  loginOptions: ["login-options"] as const,
  reachability: ["reachability"] as const,
  categories: ["categories"] as const,
  overview: ["overview"] as const,
  memories: {
    all: ["memories"] as const,
    list: (filters: Filters) => ["memories", "list", filters] as const,
    detail: (id: string | null) => ["memories", "detail", id] as const,
    provenance: (id: string | null) => ["memories", "provenance", id] as const
  },
  suggestions: {
    all: ["suggestions"] as const,
    list: (page: number) => ["suggestions", page] as const
  },
  chat: {
    all: ["chat"] as const,
    threadLists: ["chat", "threads"] as const,
    threads: (page: number) => ["chat", "threads", page] as const,
    thread: (id: string | null) => ["chat", "thread", id] as const,
    session: ["chat", "session"] as const
  },
  clients: {
    all: ["clients"] as const,
    list: (page: number) => ["clients", page] as const,
    options: ["clients", "options"] as const
  },
  policies: {
    all: ["policies"] as const,
    byClient: (id: string | null, page = 1) => ["policies", id, page] as const
  },
  jobs: {
    all: ["jobs"] as const,
    list: (page: number) => ["jobs", page] as const,
    settings: ["jobs", "settings"] as const
  },
  audit: {
    all: ["audit"] as const,
    list: (filters: Filters) => ["audit", filters] as const
  },
  requests: {
    all: ["requests"] as const,
    list: (page: number) => ["requests", page] as const,
    detail: (id: string | null) => ["requests", "detail", id] as const
  },
  processing: ["processing"] as const
};

export function apiQueryKey(
  apiUrl: string,
  key: QueryKey,
  ownerId: string | null = null
): QueryKey {
  return ownerId ? [apiUrl, ownerId, ...key] : [apiUrl, ...key];
}
