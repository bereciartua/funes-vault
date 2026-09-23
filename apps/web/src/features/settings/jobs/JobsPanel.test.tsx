import type { JobRun } from "@funes-vault/shared";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "../../../lib/api/api-context";
import { render } from "../../../test/render";
import { jobRunSentence } from "./job-presentation";
import { JobsPanel } from "./JobsPanel";

const baseRun: JobRun = {
  id: "job_1",
  type: "GENERATE_EMBEDDING",
  status: "SUCCEEDED",
  attempts: 1,
  maxAttempts: 3,
  metadata: {},
  consolidation: null,
  error: null,
  startedAt: "2026-07-10T15:19:00.000Z",
  finishedAt: "2026-07-10T15:19:01.000Z",
  createdAt: "2026-07-10T15:19:00.000Z",
  updatedAt: "2026-07-10T15:19:01.000Z"
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("jobRunSentence", () => {
  it("keeps successful runs compact", () => {
    expect(jobRunSentence(baseRun)).toBe(
      "Generate embedding succeeded · 1 attempt"
    );
  });

  it("describes failures and queued work as prose", () => {
    expect(
      jobRunSentence({
        ...baseRun,
        status: "FAILED",
        attempts: 3,
        error: "boom"
      })
    ).toBe("Generate embedding failed after 3 of 3 attempts");
    expect(jobRunSentence({ ...baseRun, status: "QUEUED", attempts: 0 })).toBe(
      "Generate embedding is queued · up to 3 attempts"
    );
  });
});

describe("JobsPanel feed", () => {
  it("expands successful and failed runs with status-appropriate actions", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const successfulRun: JobRun = {
      ...baseRun,
      type: "CONSOLIDATE_MEMORIES",
      consolidation: {
        trigger: "manual",
        mode: "REVIEW_ONLY",
        inspectedMemoryCount: 8,
        recentMemoryCount: 3,
        expiredMemoryCount: 0,
        candidateCount: 2,
        suggestionsCreated: 1,
        actionsAutoApplied: 0,
        noActionPairs: 1,
        actions: []
      }
    };
    const failedRun: JobRun = {
      ...baseRun,
      id: "job_failed",
      status: "FAILED",
      attempts: 3,
      error: "worker exploded"
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("consolidation-settings")) {
          return new Response(
            JSON.stringify({
              settings: { enabled: false, mode: "REVIEW_ONLY" }
            }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            items: [successfulRun, failedRun],
            pagination: { page: 1, limit: 20, total: 2, totalPages: 1 }
          }),
          { status: 200 }
        );
      })
    );

    render(
      <ApiProvider apiUrl="http://localhost:4000">
        <JobsPanel />
      </ApiProvider>
    );
    expect(
      await screen.findByText("Consolidate memories succeeded · 1 attempt")
    ).toBeTruthy();
    const detailButtons = screen.getAllByRole("button", { name: "Details" });
    expect(detailButtons).toHaveLength(2);
    fireEvent.click(detailButtons[0]!);
    expect(await screen.findByText(/8 memories inspected/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(detailButtons[1]!);
    expect(await screen.findByText("worker exploded")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("disables run now while its trigger request is in flight", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    let resolveRun: ((response: Response) => void) | undefined;
    const runResponse = new Promise<Response>((resolve) => {
      resolveRun = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url.includes("/v1/jobs/consolidation-runs") &&
          init?.method === "POST"
        ) {
          return runResponse;
        }
        if (url.includes("consolidation-settings")) {
          return new Response(
            JSON.stringify({
              settings: { enabled: false, mode: "REVIEW_ONLY" }
            }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            items: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
          }),
          { status: 200 }
        );
      })
    );

    render(
      <ApiProvider apiUrl="http://localhost:4000">
        <JobsPanel />
      </ApiProvider>
    );
    await screen.findByText(
      "No runs yet. Run consolidation to see results here."
    );
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    const starting = await screen.findByRole("button", { name: "Starting..." });
    expect(starting.hasAttribute("disabled")).toBe(true);

    resolveRun?.(
      new Response(JSON.stringify({ job: { ...baseRun, status: "QUEUED" } }), {
        status: 200
      })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Run now" }).hasAttribute("disabled")
      ).toBe(false)
    );
  });
});
