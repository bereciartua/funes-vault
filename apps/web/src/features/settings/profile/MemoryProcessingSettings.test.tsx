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
  options: {
    extraction: { typesafe: true, openai: true },
    consolidation: { typesafe: true, openai: true }
  }
};
describe("memory processing controls", () => {
  beforeEach(() =>
    vi.mocked(apiFetch).mockReset().mockResolvedValue(capabilities)
  );
  afterEach(cleanup);
  it("discloses hybrid processing and selects OpenAI for extraction", async () => {
    render(
      <ApiProvider apiUrl="http://api">
        <MemoryProcessingSettings />
      </ApiProvider>
    );
    await screen.findByRole("combobox", {
      name: "Provider for conversational extraction"
    });
    expect(screen.getByText(/before sensitivity is known/)).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Provider for conversational extraction"
      }),
      { target: { value: "system_2" } }
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v1/memory-processing/provider",
          body: { scope: "extraction", system: "system_2" }
        })
      )
    );
    expect(
      screen.getByRole("combobox", {
        name: "Provider for saved-memory consolidation"
      })
    ).toBeTruthy();
  });
  it("selects OpenAI for consolidation without changing extraction", async () => {
    render(
      <ApiProvider apiUrl="http://api">
        <MemoryProcessingSettings />
      </ApiProvider>
    );
    fireEvent.change(
      await screen.findByRole("combobox", {
        name: "Provider for saved-memory consolidation"
      }),
      { target: { value: "system_2" } }
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { scope: "consolidation", system: "system_2" }
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
