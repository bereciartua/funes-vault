import { describe, expect, it } from "vitest";

import { VAULT_MEMORY_PAGE_LIMIT } from "./memory-constants";
import {
  buildVaultFilterSummary,
  memoryBodyPreview,
  vaultFiltersMatchDefaults
} from "./memory-filters";

describe("filters", () => {
  it("uses a compact default page size for the Vault memory list", () => {
    expect(VAULT_MEMORY_PAGE_LIMIT).toBe(10);
  });
  it("summarizes Vault filters while treating the default active status as reset", () => {
    expect(
      vaultFiltersMatchDefaults({
        query: "",
        categoryKey: "",
        sensitivity: "",
        status: "ACTIVE",
        reviewState: ""
      })
    ).toBe(true);

    const summary = buildVaultFilterSummary(
      {
        query: " concise help ",
        categoryKey: "work",
        sensitivity: "RESTRICTED",
        status: "ARCHIVED",
        reviewState: "PENDING"
      },
      [{ key: "work", name: "Work" }]
    );

    expect(summary.map((item) => item.label)).toEqual([
      "Search: concise help",
      "Category: Work",
      "Sensitivity: Restricted",
      "Status: Archived",
      "Review: Pending"
    ]);
  });
  it("normalizes memory body previews for compact Vault rows", () => {
    expect(memoryBodyPreview("Line one\n\nLine two", 80)).toBe(
      "Line one Line two"
    );
    expect(memoryBodyPreview("This memory has a long body", 18)).toBe(
      "This memory has..."
    );
  });
});
