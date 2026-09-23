"use client";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { Button } from "../../../components/ui/button";
import { FormField } from "../../../components/ui/form-field";
import { SelectField } from "../../../components/ui/select";
import { label } from "../../../lib/domain/labels";
import type { MemoryWorkspace } from "../hooks/use-memory-workspace";
import {
  reviewStates,
  sensitivities,
  statuses,
  vaultFilterPanelId
} from "../memory-constants";

export function MemoryFilters(props: MemoryWorkspace["filters"]) {
  const {
    categories,
    filters,
    filtersExpanded,
    setFiltersExpanded,
    activeFilterSummary,
    filtersAreDefault,
    updateFilters,
    resetFilters
  } = props;

  return (
    <form className="filters" onSubmit={(event) => event.preventDefault()}>
      <FormField className="vault-search" label="Search">
        <input
          type="search"
          value={filters.query}
          onChange={(event) =>
            updateFilters((current) => ({
              ...current,
              query: event.target.value
            }))
          }
          placeholder="Title, body, or meaning"
        />
      </FormField>

      <FormField label="Sensitivity" className="vault-sensitivity-filter">
        <SelectField
          ariaLabel="Filter sensitivity"
          value={filters.sensitivity}
          options={[
            { label: "Any", value: "" },
            ...sensitivities.map((sensitivity) => ({
              label: label(sensitivity),
              value: sensitivity
            }))
          ]}
          onValueChange={(sensitivity) =>
            updateFilters((current) => ({
              ...current,
              sensitivity
            }))
          }
        />
      </FormField>

      <div className="filter-summary" aria-label="Active filters">
        {activeFilterSummary.length > 0 ? (
          activeFilterSummary.map((item) => (
            <span key={`${item.key}-${item.label}`}>{item.label}</span>
          ))
        ) : (
          <span>All non-deleted memories</span>
        )}
      </div>

      <div className="filter-actions">
        <Button
          type="button"
          variant="secondary"
          className="filter-toggle"
          aria-controls={vaultFilterPanelId}
          aria-expanded={filtersExpanded}
          onClick={() => setFiltersExpanded((current) => !current)}
        >
          <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2.5} />
          Filters
          <ChevronDown
            className="filter-toggle-caret"
            data-open={filtersExpanded}
            aria-hidden="true"
            size={16}
            strokeWidth={2.5}
          />
        </Button>
        <Button
          type="button"
          variant={filtersAreDefault ? "ghost" : "secondary"}
          className="filter-reset"
          disabled={filtersAreDefault}
          onClick={resetFilters}
        >
          Reset
        </Button>
      </div>

      {filtersExpanded ? (
        <div
          id={vaultFilterPanelId}
          className="filter-panel"
          aria-label="Advanced memory filters"
        >
          <FormField label="Category">
            <SelectField
              ariaLabel="Filter category"
              value={filters.categoryKey}
              options={[
                { label: "All categories", value: "" },
                ...categories.map((category) => ({
                  label: category.name,
                  value: category.key
                }))
              ]}
              onValueChange={(categoryKey) =>
                updateFilters((current) => ({
                  ...current,
                  categoryKey
                }))
              }
            />
          </FormField>
          <FormField label="Status">
            <SelectField
              ariaLabel="Filter status"
              value={filters.status}
              options={[
                { label: "All non-deleted", value: "" },
                ...statuses.map((status) => ({
                  label: label(status),
                  value: status
                }))
              ]}
              onValueChange={(status) =>
                updateFilters((current) => ({
                  ...current,
                  status
                }))
              }
            />
          </FormField>
          <FormField label="Review">
            <SelectField
              ariaLabel="Filter review state"
              value={filters.reviewState}
              options={[
                { label: "Any review state", value: "" },
                ...reviewStates.map((reviewState) => ({
                  label: label(reviewState),
                  value: reviewState
                }))
              ]}
              onValueChange={(reviewState) =>
                updateFilters((current) => ({
                  ...current,
                  reviewState
                }))
              }
            />
          </FormField>
        </div>
      ) : null}
    </form>
  );
}
