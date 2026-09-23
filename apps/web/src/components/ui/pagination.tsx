import type { Pagination } from "@funes-vault/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { pluralize, pluralNoun } from "../../lib/text";
import { IconButton } from "./button";
import { SelectField } from "./select";

const DEFAULT_PAGE_LIMIT = 25;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function emptyPagination(limit = DEFAULT_PAGE_LIMIT): Pagination {
  return {
    page: 1,
    limit,
    total: 0,
    totalPages: 0
  };
}

type PaginationControlsProps = {
  className?: string;
  disabled?: boolean;
  itemLabel: string;
  nextLabel?: string;
  pageSizeOptions?: readonly number[];
  pagination: Pagination;
  previousLabel?: string;
  showPageSize?: boolean;
  variant?: "compact" | "full" | "stream";
  onLimitChange: (limit: number) => void;
  onPageChange: (page: number) => void;
};

export function PaginationControls({
  className,
  disabled = false,
  itemLabel,
  nextLabel,
  onLimitChange,
  onPageChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  pagination,
  previousLabel,
  showPageSize,
  variant = "full"
}: PaginationControlsProps) {
  const shouldShowPageSize =
    showPageSize ?? (variant === "full" && pagination.total > pagination.limit);

  if (pagination.total === 0) {
    return null;
  }
  if (pagination.total <= pagination.limit && !shouldShowPageSize) {
    return null;
  }

  const totalPages = pagination.totalPages;
  const displayPage = Math.min(pagination.page, totalPages || 1);
  const firstItem = (displayPage - 1) * pagination.limit + 1;
  const lastItem = Math.min(displayPage * pagination.limit, pagination.total);
  const canGoBack = pagination.page > 1;
  const canGoForward =
    totalPages > 0 && pagination.page < Math.max(totalPages, 1);
  const pageSizeOptionsWithCurrent = Array.from(
    new Set([...pageSizeOptions, pagination.limit])
  ).sort((left, right) => left - right);
  const previousText =
    previousLabel ?? (variant === "stream" ? "Newer" : "Previous");
  const nextText = nextLabel ?? (variant === "stream" ? "Older" : "Next");
  const pageText =
    variant === "full"
      ? `Page ${displayPage} of ${totalPages}`
      : `${displayPage} of ${totalPages}`;

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className={["pagination-controls", className].filter(Boolean).join(" ")}
      data-page-size={shouldShowPageSize ? "true" : "false"}
      data-variant={variant}
    >
      <p className="pagination-summary">
        {firstItem}-{lastItem} of {pluralize(pagination.total, itemLabel)}
      </p>
      <div className="pagination-actions">
        {shouldShowPageSize ? (
          <label className="pagination-limit">
            Per page
            <SelectField
              ariaLabel={`${itemLabel} per page`}
              disabled={disabled}
              value={String(pagination.limit)}
              options={pageSizeOptionsWithCurrent.map((option) => ({
                label: String(option),
                value: String(option)
              }))}
              onValueChange={(value) => onLimitChange(Number(value))}
            />
          </label>
        ) : null}
        <div className="pagination-page-actions">
          <IconButton
            type="button"
            className="pagination-page-button"
            label={`${previousText} ${pluralNoun(2, itemLabel)}`}
            title={previousText}
            variant="secondary"
            disabled={disabled || !canGoBack}
            onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
          >
            <ChevronLeft aria-hidden="true" size={18} strokeWidth={2.6} />
          </IconButton>
          <span className="pagination-page">{pageText}</span>
          <IconButton
            type="button"
            className="pagination-page-button"
            label={`${nextText} ${pluralNoun(2, itemLabel)}`}
            title={nextText}
            variant="secondary"
            disabled={disabled || !canGoForward}
            onClick={() => onPageChange(pagination.page + 1)}
          >
            <ChevronRight aria-hidden="true" size={18} strokeWidth={2.6} />
          </IconButton>
        </div>
      </div>
    </nav>
  );
}
