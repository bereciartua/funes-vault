import { describe, expect, it } from "vitest";

import {
  createMemoryRequestSchema,
  updateMemoryRequestSchema
} from "./memories.js";
describe("memory writes", () => {
  it("applies defaults on create without adding them to a patch", () => {
    expect(
      createMemoryRequestSchema.parse({
        kind: "FACT",
        title: "Title",
        body: "Body"
      })
    ).toMatchObject({ status: "ACTIVE", categoryKeys: [], confidence: 1 });
    expect(updateMemoryRequestSchema.parse({ title: "Changed" })).toEqual({
      title: "Changed"
    });
    expect(updateMemoryRequestSchema.safeParse({}).success).toBe(false);
  });
});
