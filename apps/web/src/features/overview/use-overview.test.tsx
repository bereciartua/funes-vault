import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installApiMock } from "../../test/api-mock";
import { queryWrapper } from "../../test/query-wrapper";
import { useOverview } from "./use-overview";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("overview loading", () => {
  it("retains an explicit error instead of inventing an empty vault", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installApiMock([
      {
        path: "/v1/overview",
        status: 503,
        response: { message: "Unavailable" }
      }
    ]);
    const { wrapper } = queryWrapper();
    const { result } = renderHook(useOverview, { wrapper });
    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
