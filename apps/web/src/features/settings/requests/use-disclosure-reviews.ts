"use client";
import {
  memoryRequestPreviewSchema,
  memoryRequestReviewsResponseSchema,
  okResponseSchema,
  type ReviewDisclosureRequest
} from "@funes-vault/shared";
import { useSearchParams } from "next/navigation";
import { type SetStateAction, useEffect, useState } from "react";

import { apiErrorMessage } from "../../../lib/api/api-client";
import { queryKeys } from "../../../lib/api/query-keys";
import {
  useApiMutation,
  useApiQuery,
  useInvalidateQueries
} from "../../../lib/api/use-api";
export function useDisclosureReviews() {
  const params = useSearchParams();
  const requestedId = params.get("requestId");
  const [id, setId] = useState<string | null>(requestedId);
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<{
    id: string;
    revision: string;
    ids: string[];
  } | null>(null);
  const [blockedId, setBlockedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    setId(requestedId);
    setSelection(null);
    setBlockedId(null);
  }, [requestedId]);
  const listQuery = useApiQuery({
    retainPreviousPage: true,
    key: queryKeys.requests.list(page),
    path: `/v1/memory-request-reviews?page=${page}&limit=20`,
    schema: memoryRequestReviewsResponseSchema,
    staleTime: 0
  });
  const detail = useApiQuery({
    key: queryKeys.requests.detail(id),
    path: `/v1/memory-request-reviews/${encodeURIComponent(id ?? "")}`,
    schema: memoryRequestPreviewSchema,
    enabled: Boolean(id),
    staleTime: Infinity,
    refetchOnWindowFocus: false
  });
  const changedSelection =
    selection?.id === id &&
    detail.data &&
    selection.revision !== detail.data.revision;
  const preview =
    blockedId === id || changedSelection ? undefined : detail.data;
  const selected =
    selection?.id === id && selection?.revision === preview?.revision
      ? selection.ids
      : (preview?.items.map((item) => item.memoryId) ?? []);
  const invalidate = useInvalidateQueries();
  const mutation = useApiMutation({
    path: (input: { id: string; body: ReviewDisclosureRequest }) =>
      `/v1/memory-request-reviews/${encodeURIComponent(input.id)}`,
    method: "PATCH",
    schema: okResponseSchema,
    body: (input) => input.body,
    invalidate: [
      queryKeys.requests.all,
      queryKeys.audit.all,
      queryKeys.overview
    ]
  });
  function setSelected(value: SetStateAction<string[]>) {
    if (!preview || !id) {
      return;
    }
    setSelection({
      id,
      revision: preview.revision,
      ids: typeof value === "function" ? value(selected) : value
    });
  }
  async function decide(action: "approve" | "deny") {
    if (!preview) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await mutation.mutateAsync({
        id: preview.request.id,
        body:
          action === "deny"
            ? { action }
            : { action, revision: preview.revision, memoryIds: selected }
      });
      setMessage(
        action === "approve"
          ? "Approved once. The requesting app can retrieve the selected text within 15 minutes."
          : "Request denied. No memory text was shared."
      );
      setId(null);
      setSelection(null);
    } catch (error) {
      setError(apiErrorMessage(error, "Could not review this request."));
      // A stale preview must be explicitly refreshed before another approval attempt.
      setBlockedId(id);
    }
  }
  function selectRequest(next: string) {
    setId(next);
    setSelection(null);
    setBlockedId(null);
    setError(null);
    setMessage(null);
  }
  async function refresh() {
    setError(null);
    setBlockedId(id);
    const result = await detail.refetch();
    await invalidate(queryKeys.requests.list(page));
    if (result.isSuccess) {
      setSelection(null);
      setBlockedId(null);
    }
  }

  return {
    id,
    page,
    setPage,
    list: listQuery.data,
    preview,
    selected,
    setSelected,
    error:
      error ??
      (changedSelection
        ? "The preview changed. Refresh requests before approving."
        : null) ??
      (listQuery.error
        ? "Could not load sharing requests."
        : detail.error
          ? apiErrorMessage(
              detail.error,
              "Could not load the disclosure preview."
            )
          : null),
    message,
    busy: mutation.isPending,
    decide,
    selectRequest,
    refresh
  };
}
