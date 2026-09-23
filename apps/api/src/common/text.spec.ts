import { describe, expect, it } from "vitest";

import { extractTerms } from "./text.js";
describe("extractTerms", () => {
  it("deduplicates Unicode words and preserves meaningful punctuation", () => {
    expect(
      extractTerms(
        "Please remember Zürich Zürich café multi-tenant project_42!"
      )
    ).toEqual(["zürich", "café", "multi-tenant", "project_42"]);
  });
  it("applies the caller limit after removing filler and duplicates", () => {
    expect(extractTerms("the API api server client memory", 2)).toEqual([
      "api",
      "server"
    ]);
    expect(extractTerms("a an the user")).toEqual([]);
  });
});
