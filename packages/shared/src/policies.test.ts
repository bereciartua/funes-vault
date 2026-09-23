import { describe, expect, it } from "vitest";

import { policyRiskFactors } from "./index.js";

describe("policyRiskFactors", () => {
  it("flags the shared broad-policy risk factors", () => {
    expect(
      policyRiskFactors(
        {
          allowedCategoryCount: 0,
          maxSensitivity: "SECRET",
          operations: ["READ", "WRITE", "EXPORT"],
          requiresConfirmation: false,
          expiresAt: null
        },
        5
      )
    ).toEqual(
      expect.arrayContaining([
        "SECRET_ALLOWED",
        "ALL_CATEGORIES",
        "NO_CONFIRMATION",
        "NO_EXPIRATION",
        "WRITE_ALLOWED",
        "EXPORT_ALLOWED"
      ])
    );
  });
});
