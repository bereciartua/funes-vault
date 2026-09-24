import type { JobRun } from "@funes-vault/shared";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render } from "../../../test/render";
import { jobRunSentence } from "./job-presentation";
import { JobRunDetail } from "./JobRunDetail";

const job: JobRun = {
  id: "job",
  type: "CONSOLIDATE_MEMORIES",
  status: "SUCCEEDED",
  attempts: 1,
  maxAttempts: 3,
  metadata: {
    semantic: {
      status: "completed",
      maxSensitivity: "INTERNAL",
      skippedSources: 6,
      skippedPairs: 0,
      skippedSourceReasons: { above_sensitivity_limit: 6 }
    }
  },
  error: null,
  startedAt: null,
  finishedAt: null,
  createdAt: "2026-09-24T18:43:19Z",
  updatedAt: "2026-09-24T18:43:19Z",
  consolidation: {
    trigger: "manual",
    mode: "REVIEW_ONLY",
    inspectedMemoryCount: 19,
    recentMemoryCount: 19,
    expiredMemoryCount: 0,
    candidateCount: 0,
    suggestionsCreated: 0,
    actionsAutoApplied: 0,
    noActionPairs: 19,
    actions: []
  }
};

describe("consolidation outcome explanation", () => {
  it("explains expected exclusions without an error or futile retry", () => {
    render(<JobRunDetail job={job} onRetry={vi.fn()} retrying={false} />);
    expect(jobRunSentence(job)).toBe(
      "Consolidation completed · 6 memories skipped"
    );
    expect(
      screen.getByText("6 above the sensitivity limit for memory comparison.")
    ).toBeTruthy();
    expect(screen.getByText(/No retry is needed/)).toBeTruthy();
    expect(
      screen.getByText(/configured for Internal sensitivity and below/)
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText(/pairs unchanged/)).toBeNull();
  });
  it("explains a provider outage and allows retry", () => {
    const onRetry = vi.fn();
    render(
      <JobRunDetail
        job={{
          ...job,
          status: "FAILED",
          error: "old generic error",
          metadata: {
            semantic: { status: "failed", reason: "provider_unavailable" }
          }
        }}
        onRetry={onRetry}
        retrying={false}
      />
    );
    expect(screen.getByText(/Memory comparison could not finish/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it("directs the owner to permission settings instead of retrying unchanged consent", () => {
    render(
      <JobRunDetail
        job={{
          ...job,
          status: "FAILED",
          error: "old generic error",
          metadata: {
            semantic: {
              status: "skipped",
              reason: "processing_consent_required"
            }
          }
        }}
        onRetry={vi.fn()}
        retrying={false}
      />
    );
    expect(screen.getByText(/Settings → Profile/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
  it("does not invent reasons for historical exclusions or relabel recorded failures", () => {
    const historical = {
      ...job,
      status: "FAILED" as const,
      error: "Semantic processing incomplete",
      metadata: { semantic: { status: "partial", skippedSources: 6 } }
    };
    render(
      <JobRunDetail job={historical} onRetry={vi.fn()} retrying={false} />
    );
    expect(
      screen.getByText(/did not record the individual reasons/)
    ).toBeTruthy();
    expect(jobRunSentence(historical)).toContain("failed");
    expect(screen.queryByText(/No retry is needed/)).toBeNull();
  });
  it("does not imply memories were compared when all sources were excluded", () => {
    render(
      <JobRunDetail
        job={{
          ...job,
          consolidation: { ...job.consolidation!, recentMemoryCount: 6 }
        }}
        onRetry={vi.fn()}
        retrying={false}
      />
    );
    expect(
      screen.getByText(/No memories were eligible for comparison/)
    ).toBeTruthy();
  });
});
