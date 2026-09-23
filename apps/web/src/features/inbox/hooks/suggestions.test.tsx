import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installApiMock } from "../../../test/api-mock";
import { pageFixture } from "../../../test/fixtures/memory";
import { queryWrapper } from "../../../test/query-wrapper";
import { useSuggestionReview } from "./use-suggestion-review";
import { useSuggestions } from "./use-suggestions";
afterEach(() => vi.unstubAllGlobals());
describe("suggestion review queries", () => {
  it("refreshes the inbox after bulk review while preserving partial failures", async () => {
    const response = {
      action: "apply",
      requested: 2,
      succeeded: 1,
      failed: 1,
      results: [
        { id: "one", status: "applied" },
        { id: "two", status: "failed", error: "Already reviewed" }
      ]
    };
    const fetch = installApiMock([
      { path: "/v1/memory-suggestions", response: pageFixture([]) },
      { method: "PATCH", path: "/v1/memory-suggestions/review", response }
    ]);
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => ({ list: useSuggestions(1), review: useSuggestionReview() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    await act(async () => {
      expect(
        await result.current.review.bulk.mutateAsync({
          ids: ["one", "two"],
          action: "apply"
        })
      ).toEqual(response);
    });
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "GET")
    ).toHaveLength(2);
  });
});
