import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

import { render } from "../../../test/render";
import {
  buildVaultFilterSummary,
  initialFilters,
  vaultFiltersMatchDefaults
} from "../memory-filters";
import { MemoryFilters } from "./MemoryFilters";

const category = {
  id: "work",
  key: "work",
  name: "Work",
  description: null,
  createdAt: "2026-09-23T12:00:00Z",
  updatedAt: "2026-09-23T12:00:00Z"
};

function FiltersHarness() {
  const [filters, updateFilters] = useState(initialFilters);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const categories = [category];

  return (
    <>
      <MemoryFilters
        filters={filters}
        categories={categories}
        updateFilters={updateFilters}
        filtersExpanded={filtersExpanded}
        setFiltersExpanded={setFiltersExpanded}
        activeFilterSummary={buildVaultFilterSummary(filters, categories)}
        filtersAreDefault={vaultFiltersMatchDefaults(filters)}
        resetFilters={() => updateFilters(initialFilters)}
      />
      <output aria-label="Selected filters">{JSON.stringify(filters)}</output>
    </>
  );
}

it("combines search and privacy filters and resets them to the active-memory default", async () => {
  const user = userEvent.setup();
  render(<FiltersHarness />);
  await user.type(screen.getByRole("searchbox"), "private preference");
  await user.click(screen.getByRole("button", { name: "Filters" }));
  for (const [field, option] of [
    ["Filter sensitivity", "Restricted"],
    ["Filter category", category.name],
    ["Filter status", "Archived"],
    ["Filter review state", "Approved"]
  ]) {
    await user.click(screen.getByRole("combobox", { name: field }));
    await user.click(screen.getByRole("option", { name: option }));
  }
  expect(
    JSON.parse(screen.getByLabelText("Selected filters").textContent!)
  ).toEqual({
    query: "private preference",
    sensitivity: "RESTRICTED",
    categoryKey: category.key,
    status: "ARCHIVED",
    reviewState: "APPROVED"
  });
  await user.click(screen.getByRole("button", { name: "Reset" }));
  expect(
    JSON.parse(screen.getByLabelText("Selected filters").textContent!)
  ).toEqual(initialFilters);
  expect(screen.getByRole("searchbox")).toHaveProperty("value", "");
  await user.click(screen.getByRole("button", { name: "Filters" }));
  expect(
    screen.queryByRole("combobox", { name: "Filter category" })
  ).toBeNull();
});
