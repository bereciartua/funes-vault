import { paginationSchema } from "@funes-vault/shared";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  emptyPagination,
  PaginationControls
} from "../../components/ui/pagination";
import { installApiMock } from "../../test/api-mock";
import { queryWrapper } from "../../test/query-wrapper";
import { useApiQuery } from "./use-api";

const schema = z.object({ pagination: paginationSchema });
afterEach(() => vi.unstubAllGlobals());
it("keeps the focused next-page control mounted while the next page loads", async () => {
  let resolve: (value: unknown) => void = () => undefined;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const pagination = { page: 1, limit: 10, total: 30, totalPages: 3 };
  installApiMock([
    {
      path: "/pages",
      response: ({ url }: { url: URL }) =>
        url.searchParams.get("page") === "1" ? { pagination } : pending
    }
  ]);
  function List() {
    const [page, setPage] = useState(1);
    const query = useApiQuery({
      key: ["pages", page],
      path: `/pages?page=${page}`,
      schema,
      retainPreviousPage: true
    });
    if (query.isPending) {
      return <p>Loading</p>;
    }

    return (
      <PaginationControls
        pagination={query.data?.pagination ?? emptyPagination()}
        itemLabel="memory"
        onPageChange={setPage}
        onLimitChange={() => {}}
      />
    );
  }
  render(<List />, { wrapper: queryWrapper().wrapper });
  const next = await screen.findByRole("button", { name: "Next memories" });
  next.focus();
  fireEvent.click(next);
  expect(document.activeElement).toBe(next);
  expect(screen.queryByText("Loading")).toBeNull();
  await act(async () => resolve({ pagination: { ...pagination, page: 2 } }));
  await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeTruthy());
  expect(document.activeElement).toBe(next);
});
