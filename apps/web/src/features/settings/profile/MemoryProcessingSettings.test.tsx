import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../../lib/api/api-client";
import { ApiProvider } from "../../../lib/api/api-context";
import { render } from "../../../test/render";
import { MemoryProcessingOutcome } from "../../chat/components/MemoryProcessingOutcome";
import { MemoryProcessingSettings } from "./MemoryProcessingSettings";
vi.mock("../../../lib/api/api-client", () => ({ apiFetch: vi.fn() }));
const capabilities = {
  fingerprint: "test",
  extraction: {
    system: "system_1",
    model: "jev-1.13.0",
    available: true,
    processors: ["typesafe", "openai"]
  },
  consolidation: {
    system: "system_1",
    model: "jev-1.13.0",
    available: true,
    processors: ["typesafe"],
    maxSensitivity: "INTERNAL"
  },
  consents: []
};
describe("memory processing controls", () => {
  beforeEach(() =>
    vi.mocked(apiFetch).mockReset().mockResolvedValue(capabilities)
  );
  afterEach(cleanup);
  it("discloses hybrid processing and grants only the chosen consent scope", async () => {
    render(
      <ApiProvider apiUrl="http://api">
        <MemoryProcessingSettings />
      </ApiProvider>
    );
    await screen.findByText(/TypeSafe Jev \(memory classifier\) \+ OpenAI/);
    expect(screen.getByText(/before sensitivity is known/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Allow TypeSafe extraction" })
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v1/memory-processing/consent",
          body: { scope: "extraction", version: 1, granted: true }
        })
      )
    );
    expect(
      screen.getByRole("button", { name: "Allow TypeSafe consolidation" })
    ).toBeTruthy();
  });
  it("revokes an existing scope without changing the other task", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ...capabilities,
      consents: [
        {
          processor: "typesafe",
          scope: "consolidation",
          version: 1,
          revokedAt: null
        }
      ]
    });
    render(
      <ApiProvider apiUrl="http://api">
        <MemoryProcessingSettings />
      </ApiProvider>
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Revoke TypeSafe consolidation"
      })
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { scope: "consolidation", version: 1, granted: false }
        })
      )
    );
  });
  it("shows durable failures and retries the source rather than submitting new text", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      status: "completed",
      outcomes: [{ status: "QUEUED_FOR_REVIEW" }]
    });
    render(
      <ApiProvider apiUrl="http://api">
        <MemoryProcessingOutcome
          initial={{
            status: "failed",
            sourceMessageId: "source",
            outcomes: []
          }}
        />
      </ApiProvider>
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry memory processing" })
    );
    await screen.findByText(/0 saved, 1 queued/);
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v1/memory-processing/sources/source/retry",
        method: "POST"
      })
    );
  });
});
