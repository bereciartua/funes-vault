import { describe, expect, it } from "vitest";

import { duplicateSuggestionIds } from "./suggestion-selection";

describe("duplicates", () => {
  it("flags later exact-duplicate suggestions, keeping the first occurrence", () => {
    const duplicates = duplicateSuggestionIds([
      {
        id: "s1",
        title: "Favorite color is blue",
        body: "The user's favorite color is blue."
      },
      { id: "s2", title: "Likes dogs", body: "The user likes dogs." },
      {
        id: "s3",
        title: "Favorite color is blue",
        body: "The user's  favorite color is BLUE."
      },
      {
        id: "s4",
        title: "Likes the color orange",
        body: "The user likes the color orange."
      }
    ]);

    expect([...duplicates]).toEqual(["s3"]);
  });
});
