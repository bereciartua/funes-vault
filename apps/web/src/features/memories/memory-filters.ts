import { type MemoryCategory } from "@funes-vault/shared";

import { label } from "../../lib/domain/labels";
export type Filters = {
  query: string;
  categoryKey: string;
  sensitivity: string;
  status: string;
  reviewState: string;
};
export type FilterSummaryItem = {
  key: keyof Filters;
  label: string;
};
export const initialFilters: Filters = {
  query: "",
  categoryKey: "",
  sensitivity: "",
  status: "ACTIVE",
  reviewState: ""
};
export function memoryBodyPreview(body: string, maxLength = 140) {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
export function vaultFiltersMatchDefaults(filters: Filters) {
  return (
    filters.query === initialFilters.query &&
    filters.categoryKey === initialFilters.categoryKey &&
    filters.sensitivity === initialFilters.sensitivity &&
    filters.status === initialFilters.status &&
    filters.reviewState === initialFilters.reviewState
  );
}
export function buildVaultFilterSummary(
  filters: Filters,
  categories: Pick<MemoryCategory, "key" | "name">[]
): FilterSummaryItem[] {
  const items: FilterSummaryItem[] = [];
  const trimmedQuery = filters.query.trim();

  if (trimmedQuery) {
    items.push({ key: "query", label: `Search: ${trimmedQuery}` });
  }

  if (filters.categoryKey) {
    const categoryName =
      categories.find((category) => category.key === filters.categoryKey)
        ?.name ?? filters.categoryKey;

    items.push({
      key: "categoryKey",
      label: `Category: ${categoryName}`
    });
  }

  if (filters.sensitivity) {
    items.push({
      key: "sensitivity",
      label: `Sensitivity: ${label(filters.sensitivity)}`
    });
  }

  if (filters.status) {
    items.push({ key: "status", label: `Status: ${label(filters.status)}` });
  }

  if (filters.reviewState) {
    items.push({
      key: "reviewState",
      label: `Review: ${label(filters.reviewState)}`
    });
  }

  return items;
}
