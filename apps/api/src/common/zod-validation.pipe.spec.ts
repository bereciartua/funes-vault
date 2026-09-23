import {
  createMemoryRequestSchema,
  listMemoriesQuerySchema
} from "@funes-vault/shared";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { ZodValidationPipe } from "./zod-validation.pipe.js";

describe("ZodValidationPipe", () => {
  it("coerces and defaults query parameters like the schema does", () => {
    const pipe = new ZodValidationPipe(listMemoriesQuerySchema);

    const result = pipe.transform({
      page: "2",
      limit: "10",
      categoryKeys: "software_development"
    });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.categoryKeys).toEqual(["software_development"]);
  });

  it("rejects invalid bodies with field-level errors and no echoed values", () => {
    const pipe = new ZodValidationPipe(createMemoryRequestSchema);

    let caught: unknown;
    try {
      pipe.transform({
        kind: "NOT_A_KIND",
        title: "",
        body: "some-secret-value-that-must-not-echo",
        categoryKeys: []
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    const response = (caught as BadRequestException).getResponse() as {
      message: string;
      errors: Record<string, string[]>;
    };
    expect(response.message).toBe("Invalid request");
    expect(Object.keys(response.errors)).toEqual(
      expect.arrayContaining(["kind", "title"])
    );
    expect(JSON.stringify(response)).not.toContain(
      "some-secret-value-that-must-not-echo"
    );
  });
});
