import { describe, expect, it } from "vitest";

import { createMemorySuggestionRequestSchema } from "./index.js";

describe("createMemorySuggestionRequestSchema", () => {
  it("accepts MCP-style aliases and normalizes enum casing", () => {
    const parsed = createMemorySuggestionRequestSchema.parse({
      purpose: "software_development",
      kind: "preference",
      title: "Prefers local-first tools",
      body: "The user prefers local-first tools.",
      categories: ["privacy_preferences"],
      suggested_sensitivity: "low"
    });

    expect(parsed.kind).toBe("PREFERENCE");
    expect(parsed.sensitivity).toBe("LOW");
    expect(parsed.categoryKeys).toEqual(["privacy_preferences"]);
  });
});
