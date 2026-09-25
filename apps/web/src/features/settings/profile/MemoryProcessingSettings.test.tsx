import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async (options) =>
      options?.path === "/v1/memory-processing/provider"
        ? ({
            ...capabilities,
            extraction: {
              ...capabilities.extraction,
              system: (options.body as { system: string }).system
            }
          } as never)
        : (capabilities as never)
    );
    render(
      <ApiProvider apiUrl="http://api">
        <MemoryProcessingSettings />
      </ApiProvider>
    );
    await screen.findByRole("combobox", {
      name: "Provider for conversational extraction"
    });
    expect(screen.getByText(/before sensitivity is known/)).toBeTruthy();
    await user.click(
      screen.getByRole("combobox", {
        name: "Provider for conversational extraction"
      })
    );
    await user.click(screen.getByRole("option", { name: /^OpenAI$/ }));
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/memory-processing/provider" })
    );
    expect(
      screen.getByText(/Text already sent cannot be recalled/)
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Use OpenAI" }));
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
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", {
          name: "Provider for conversational extraction"
        }).textContent
      ).toContain("OpenAI")
    );
  });
  it("selects OpenAI for consolidation without changing extraction", async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider apiUrl="http://api">
        <MemoryProcessingSettings />
      </ApiProvider>
    );
    await user.click(
      await screen.findByRole("combobox", {
        name: "Provider for saved-memory consolidation"
      })
    );
    await user.click(screen.getByRole("option", { name: /^OpenAI$/ }));
    await user.click(screen.getByRole("button", { name: "Use OpenAI" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { scope: "consolidation", system: "system_2" }
        })
      )
    );
  });
  it("shows durable failures and retries the source rather than submitting new text", async () => {
    vi.mocked(apiFetch).mockImplementation(async (options) =>
      options?.path === "/v1/memory-processing/capabilities"
        ? (capabilities as never)
        : ({
            status: "completed",
            outcomes: [{ status: "QUEUED_FOR_REVIEW" }]
          } as never)
    );
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
  it("asks before switching to TypeSafe and keeps a cancelled selection", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue({
      ...capabilities,
      extraction: { ...capabilities.extraction, system: "system_2" }
    });
    render(
      <ApiProvider apiUrl="http://api">
        <MemoryProcessingSettings />
      </ApiProvider>
    );
    await user.click(
      await screen.findByRole("combobox", {
        name: "Provider for conversational extraction"
      })
    );
    await user.click(screen.getByRole("option", { name: "TypeSafe + OpenAI" }));
    expect(screen.getByText(/before sensitivity is known/)).toBeTruthy();
    expect(
      screen.getByText(/Text already sent cannot be recalled/)
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/memory-processing/provider" })
    );
  });
  it("names the current provider and confirms legacy reprocessing", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(async (options) =>
      options?.path === "/v1/memory-processing/capabilities"
        ? (capabilities as never)
        : ({ status: "completed", outcomes: [] } as never)
    );
    render(
      <ApiProvider apiUrl="http://api">
        <MemoryProcessingOutcome
          initial={{
            status: "skipped",
            reason: "processing_consent_required",
            sourceMessageId: "source",
            outcomes: []
          }}
        />
      </ApiProvider>
    );
    const button = await screen.findByRole("button", {
      name: "Reprocess with TypeSafe"
    });
    await user.click(button);
    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/v1/memory-processing/sources/source/reprocess"
      })
    );
    await user.click(
      screen.getAllByRole("button", { name: "Reprocess with TypeSafe" }).at(-1)!
    );
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/v1/memory-processing/sources/source/reprocess"
        })
      )
    );
  });
});
