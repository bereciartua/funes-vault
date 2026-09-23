import { describe, expect, it } from "vitest";

import { subjectHref } from "../lib/domain/subject-links";

describe("subjectHref", () => {
  it("links memory subjects to the Vault detail route", () => {
    expect(
      subjectHref({
        id: "memory 1",
        label: "Memory",
        metadata: {},
        role: "TARGET",
        type: "MEMORY"
      })
    ).toBe("/vault?memoryId=memory%201");
  });

  it("links operational subjects to their canonical surfaces", () => {
    expect(
      subjectHref({
        id: "job_1",
        label: "Job",
        metadata: {},
        role: "TARGET",
        type: "JOB_RUN"
      })
    ).toBe("/settings/jobs");
    expect(
      subjectHref({
        id: "suggestion_1",
        label: "Suggestion",
        metadata: {},
        role: "TARGET",
        type: "MEMORY_SUGGESTION"
      })
    ).toBe("/inbox");
    expect(
      subjectHref({
        id: "request_1",
        label: "Request",
        metadata: {},
        role: "TARGET",
        type: "MEMORY_REQUEST"
      })
    ).toBe("/settings/requests?requestId=request_1");
  });
});
