import type { ListMemorySuggestionsResponse } from "@funes-vault/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiProvider, createQueryClient } from "../../../lib/api/api-context";
import { apiQueryKey, queryKeys } from "../../../lib/api/query-keys";
import { installApiMock } from "../../../test/api-mock";
import { useSuggestionReview } from "./use-suggestion-review";

const apiUrl = "http://vault.test";
afterEach(() => vi.unstubAllGlobals());
it("removes pending reviews immediately and restores only partial failures", async () => {
  const client = createQueryClient();
  const key = apiQueryKey(apiUrl, queryKeys.suggestions.list(1), "alice");
  const item = (id: string) => ({
    id,
    title: id,
    body: "Context",
    kind: "FACT" as const,
    sensitivity: "LOW" as const,
    categoryKeys: [],
    evidence: null,
    confidence: 1,
    expiresAt: null,
    status: "QUEUED_FOR_REVIEW" as const,
    source: {
      type: "MANUAL" as const,
      clientId: null,
      metadata: {},
      subjects: []
    },
    createdAt: "2026-09-22T00:00:00Z",
    updatedAt: "2026-09-22T00:00:00Z"
  });
  client.setQueryData<ListMemorySuggestionsResponse>(key, {
    items: [item("one"), item("two")],
    pagination: { page: 1, limit: 25, total: 2, totalPages: 1 }
  });
  let finish!: (value: unknown) => void;
  installApiMock([
    {
      path: "/v1/memory-suggestions/review",
      method: "PATCH",
      response: () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    }
  ]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider apiUrl={apiUrl} ownerId="alice" client={client}>
      {children}
    </ApiProvider>
  );
  const { result } = renderHook(useSuggestionReview, { wrapper });
  act(() =>
    result.current.bulk.mutate({ ids: ["one", "two"], action: "apply" })
  );
  await waitFor(() =>
    expect(
      client.getQueryData<ListMemorySuggestionsResponse>(key)?.items
    ).toEqual([])
  );
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () =>
    finish({
      action: "apply",
      requested: 2,
      succeeded: 1,
      failed: 1,
      results: [
        { id: "one", status: "applied" },
        { id: "two", status: "failed", error: "Please retry" }
      ]
    })
  );
  await waitFor(() => expect(result.current.bulk.isSuccess).toBe(true));
  expect(
    client
      .getQueryData<ListMemorySuggestionsResponse>(key)
      ?.items.map((item) => item.id)
  ).toEqual(["two"]);
});
