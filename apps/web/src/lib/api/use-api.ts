"use client";
import {
  keepPreviousData,
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import type { ZodType } from "zod";

import { apiFetch } from "./api-client";
import { useApiOwner, useApiUrl } from "./api-context";
import { apiQueryKey } from "./query-keys";

export function useApiQuery<T>({
  key,
  path,
  schema,
  enabled = true,
  refetchInterval,
  staleTime,
  refetchOnWindowFocus,
  retainPreviousPage = false
}: {
  key: QueryKey;
  path: string;
  schema: ZodType<T>;
  enabled?: boolean;
  refetchInterval?: number | false;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  retainPreviousPage?: boolean;
}) {
  const apiUrl = useApiUrl();
  const ownerId = useApiOwner();

  return useQuery({
    queryKey: apiQueryKey(apiUrl, key, ownerId),
    queryFn: ({ signal }) => apiFetch({ apiUrl, path, schema, signal }),
    enabled,
    refetchInterval,
    refetchOnWindowFocus,
    placeholderData: retainPreviousPage ? keepPreviousData : undefined,
    ...(staleTime === undefined ? {} : { staleTime })
  });
}

export function useInvalidateQueries() {
  const apiUrl = useApiUrl();
  const ownerId = useApiOwner();
  const client = useQueryClient();

  return useCallback(
    async (...keys: QueryKey[]) => {
      await Promise.all(
        keys.map((key) =>
          client.invalidateQueries({
            queryKey: apiQueryKey(apiUrl, key, ownerId)
          })
        )
      );
    },
    [apiUrl, ownerId, client]
  );
}

export function useApiMutation<T, Variables = void, Context = unknown>({
  path,
  method = "POST",
  schema,
  body,
  invalidate = [],
  onSuccess,
  onMutate,
  onError
}: {
  path: string | ((variables: Variables) => string);
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  schema: ZodType<T>;
  body?: (variables: Variables) => unknown;
  invalidate?: QueryKey[] | ((data: T, variables: Variables) => QueryKey[]);
  onSuccess?: (
    data: T,
    variables: Variables,
    context: Context | undefined
  ) => void | Promise<void>;
  onMutate?: (variables: Variables) => Context | Promise<Context>;
  onError?: (
    error: Error,
    variables: Variables,
    context: Context | undefined
  ) => void;
}) {
  const apiUrl = useApiUrl();
  const invalidateQueries = useInvalidateQueries();

  const mutation = useMutation<T, Error, Variables, Context>({
    onMutate,
    onError,
    gcTime: 0,
    mutationFn: (variables: Variables) =>
      apiFetch({
        apiUrl,
        path: typeof path === "function" ? path(variables) : path,
        method,
        schema,
        body: body ? body(variables) : variables
      }),
    onSuccess: async (data, variables, context) => {
      await onSuccess?.(data, variables, context);
      void invalidateQueries(
        ...(typeof invalidate === "function"
          ? invalidate(data, variables)
          : invalidate)
      );
    }
  });
  const reset = mutation.reset;
  useEffect(() => () => reset(), [reset]);

  return mutation;
}
