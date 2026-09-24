import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiProvider } from "../../../lib/api/api-context";
import { render } from "../../../test/render";
import { MemoryProcessingOutcome } from "./MemoryProcessingOutcome";

function show(reason: string) {
  render(
    <ApiProvider apiUrl="http://vault.test">
      <MemoryProcessingOutcome
        initial={{
          status: "skipped",
          reason,
          sourceMessageId: "source",
          outcomes: []
        }}
      />
    </ApiProvider>
  );
}
describe("skipped capture recovery", () => {
  it("keeps legacy finalization failures retryable after the arrival-time fix", () => {
    show("voice_finalization_window_closed");
    expect(screen.getByText(/Retry this saved turn/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Retry memory processing" })
    ).toBeTruthy();
    expect(screen.getByText(/no new memories saved/)).toBeTruthy();
  });
  it.each([
    ["voice_transcript_arrived_too_late", /arrived too late/],
    ["reconnect_voice_session", /settings changed/],
    ["secret_like_content", /appears to contain a secret/]
  ] as const)("explains %s without offering a futile retry", (reason, text) => {
    show(reason);
    expect(screen.getByText(text)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Retry memory processing" })
    ).toBeNull();
  });
  it("shows missing consent with a settings link", () => {
    show("processing_consent_required");
    expect(screen.getByText(/needs your permission/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Enable memory processing in settings" })
        .getAttribute("href")
    ).toBe("/settings/profile");
  });
});

it("shows extraction denials with a readable reason and permissions link", () => {
  render(
    <ApiProvider apiUrl="http://vault.test">
      <MemoryProcessingOutcome
        initial={{
          status: "completed",
          outcomes: [
            { status: "DENIED", reason: "no_client_policy" },
            { status: "DENIED", reason: "no_client_policy" }
          ]
        }}
      />
    </ApiProvider>
  );
  expect(screen.getByText(/0 saved, 0 queued, 2 denied/)).toBeTruthy();
  expect(screen.getByText(/This app has no permissions/)).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Manage App permissions" })
      .getAttribute("href")
  ).toBe("/settings/clients");
});
