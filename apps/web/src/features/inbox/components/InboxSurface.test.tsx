import type { Pagination } from "@funes-vault/shared";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { suggestionFixture as suggestion } from "../../../test/fixtures/suggestion";
import { render } from "../../../test/render";
import { InboxSurface } from "./InboxSurface";

const pagination: Pagination = {
  page: 1,
  limit: 25,
  total: 2,
  totalPages: 1
};

function renderInbox(
  overrides: Partial<Parameters<typeof InboxSurface>[0]> = {}
) {
  const props: Parameters<typeof InboxSurface>[0] = {
    allSuggestionsSelected: false,
    error: null,
    isBulkReviewing: false,
    message: null,
    reviewingSuggestionId: null,
    selectedSuggestionIds: new Set(),
    suggestionDuplicateIds: new Set(["suggestion_2"]),
    suggestions: [
      suggestion("suggestion_1", "Remember the release checklist"),
      suggestion("suggestion_2", "Archive duplicate", {
        source: {
          type: "CONSOLIDATION",
          clientId: null,
          metadata: { reason: "exact_duplicate" },
          subjects: []
        }
      })
    ],
    suggestionsPagination: pagination,
    onApplySuggestion: vi.fn(),
    onChangeSuggestionsLimit: vi.fn(),
    onChangeSuggestionsPage: vi.fn(),
    onConfirmRejectSuggestion: vi.fn(),
    onReviewSelectedSuggestions: vi.fn(),
    onSelectDuplicateSuggestions: vi.fn(),
    onSelectPageSuggestions: vi.fn(),
    onToggleSuggestionSelected: vi.fn(),
    ...overrides
  };

  return {
    props,
    user: userEvent.setup(),
    ...render(<InboxSurface {...props} />)
  };
}

afterEach(() => cleanup());

describe("InboxSurface", () => {
  it("drives bulk selection controls from visible actions", async () => {
    const { props, user } = renderInbox();

    await user.click(screen.getByText("Select page"));
    expect(props.onSelectPageSuggestions).toHaveBeenCalledWith(true);

    await user.click(
      screen.getByRole("button", { name: "Select 1 duplicate" })
    );
    expect(props.onSelectDuplicateSuggestions).toHaveBeenCalledOnce();
  });

  it("enables bulk review only when suggestions are selected", async () => {
    const selectedSuggestionIds = new Set(["suggestion_1"]);
    const onReviewSelectedSuggestions = vi.fn<() => Promise<void>>(() =>
      Promise.resolve()
    );
    const { user } = renderInbox({
      selectedSuggestionIds,
      onReviewSelectedSuggestions
    });

    expect(screen.getByText("1 suggestion selected")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Apply selected" }));

    expect(onReviewSelectedSuggestions).toHaveBeenCalledWith("apply");
  });
});
