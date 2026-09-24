import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { suggestionFixture } from "../../../test/fixtures/suggestion";
import { render } from "../../../test/render";
import { SuggestionCard } from "./SuggestionCard";
afterEach(cleanup);
it.each([null, "<b>Remember_My_Reason</b>"])(
  "shows the stated purpose separately from caller metadata: %s",
  (statedPurpose) => {
    const suggestion = suggestionFixture("suggestion", "A preference", {
      statedPurpose,
      policyId: "policy",
      source: {
        type: "CLIENT_SUGGESTION",
        clientId: "app",
        subjects: [],
        metadata: { caller: { action: "archive_memory" } }
      }
    });
    const { container } = render(
      <SuggestionCard
        suggestion={suggestion}
        selected={false}
        duplicate={false}
        busy={false}
        onToggleSelected={vi.fn()}
        onApply={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText(statedPurpose ?? "Not provided").tagName).toBe(
      "DD"
    );
    expect(
      screen.getByRole("link", { name: "Permissions when proposed" })
    ).toBeTruthy();
    expect(screen.getByText("Caller metadata")).toBeTruthy();
    expect(container.querySelector("dd b")).toBeNull();
  }
);
