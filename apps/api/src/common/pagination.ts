import type { Pagination, PaginationQuery } from "@funes-vault/shared";

export function buildPagination(
  query: PaginationQuery,
  total: number
): Pagination {
  const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
  const page = totalPages === 0 ? 1 : Math.min(query.page, totalPages);

  return {
    page,
    limit: query.limit,
    total,
    totalPages
  };
}

export function paginationSkip(pagination: Pagination) {
  return pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit;
}
