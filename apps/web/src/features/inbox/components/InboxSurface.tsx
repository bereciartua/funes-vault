"use client";
import type {
  Pagination,
  ReviewableMemorySuggestion
} from "@funes-vault/shared";
import Link from "next/link";

import { Button } from "../../../components/ui/button";
import { CheckboxField } from "../../../components/ui/checkbox";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { PaginationControls } from "../../../components/ui/pagination";
import { pluralize } from "../../../lib/text";
import { SuggestionCard } from "./SuggestionCard";
export function InboxSurface({
  allSuggestionsSelected,
  error,
  isBulkReviewing,
  message,
  reviewingSuggestionId,
  selectedSuggestionIds,
  suggestionDuplicateIds,
  suggestions,
  suggestionsPagination,
  onApplySuggestion,
  onChangeSuggestionsLimit,
  onChangeSuggestionsPage,
  onConfirmRejectSuggestion,
  onReviewSelectedSuggestions,
  onSelectDuplicateSuggestions,
  onSelectPageSuggestions,
  onToggleSuggestionSelected
}: {
  allSuggestionsSelected: boolean;
  error: string | null;
  isBulkReviewing: boolean;
  message: string | null;
  reviewingSuggestionId: string | null;
  selectedSuggestionIds: Set<string>;
  suggestionDuplicateIds: Set<string>;
  suggestions: ReviewableMemorySuggestion[];
  suggestionsPagination: Pagination;
  onApplySuggestion: (suggestionId: string) => Promise<void>;
  onChangeSuggestionsLimit: (limit: number) => void;
  onChangeSuggestionsPage: (page: number) => void;
  onConfirmRejectSuggestion: (
    suggestion: ReviewableMemorySuggestion
  ) => Promise<void>;
  onReviewSelectedSuggestions: (action: "apply" | "reject") => Promise<void>;
  onSelectDuplicateSuggestions: () => void;
  onSelectPageSuggestions: (checked: boolean) => void;
  onToggleSuggestionSelected: (suggestionId: string) => void;
}) {
  return (
    <section className="inbox-page" aria-label="Suggested memory inbox">
      <section className="inbox-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Suggested inbox</p>
            <Link href="/settings/requests">Review sharing requests</Link>
            <h1>
              {pluralize(suggestionsPagination.total, "queued suggestion")}
            </h1>
          </div>
          <FeedbackMessages message={message} />
          <FeedbackMessages error={error} />
        </div>
        {suggestionsPagination.total === 0 ? (
          <div className="inbox-empty">
            <p>
              That’s everything. Your vault has no suggestions waiting for
              review.
            </p>
          </div>
        ) : (
          <>
            <div className="inbox-bulk-toolbar" aria-label="Bulk review">
              <CheckboxField
                checked={allSuggestionsSelected}
                onCheckedChange={onSelectPageSuggestions}
              >
                Select page
              </CheckboxField>
              {suggestionDuplicateIds.size > 0 ? (
                <button
                  type="button"
                  className="inbox-duplicate-select"
                  disabled={isBulkReviewing}
                  onClick={onSelectDuplicateSuggestions}
                >
                  Select {pluralize(suggestionDuplicateIds.size, "duplicate")}
                </button>
              ) : null}
              <span className="inbox-bulk-count" aria-live="polite">
                {pluralize(selectedSuggestionIds.size, "suggestion")} selected
              </span>
              <div className="inbox-bulk-actions">
                <Button
                  type="button"
                  disabled={selectedSuggestionIds.size === 0 || isBulkReviewing}
                  onClick={() => void onReviewSelectedSuggestions("apply")}
                >
                  {isBulkReviewing ? "Working..." : "Apply selected"}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={selectedSuggestionIds.size === 0 || isBulkReviewing}
                  onClick={() => void onReviewSelectedSuggestions("reject")}
                >
                  Reject selected
                </Button>
              </div>
            </div>
            <div className="inbox-grid">
              {suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  selected={selectedSuggestionIds.has(suggestion.id)}
                  duplicate={suggestionDuplicateIds.has(suggestion.id)}
                  busy={
                    reviewingSuggestionId === suggestion.id || isBulkReviewing
                  }
                  onToggleSelected={onToggleSuggestionSelected}
                  onApply={onApplySuggestion}
                  onReject={onConfirmRejectSuggestion}
                />
              ))}
            </div>
            <PaginationControls
              disabled={reviewingSuggestionId !== null || isBulkReviewing}
              itemLabel="suggestion"
              nextLabel="Next queued"
              pagination={suggestionsPagination}
              previousLabel="Previous queued"
              variant="compact"
              onLimitChange={onChangeSuggestionsLimit}
              onPageChange={onChangeSuggestionsPage}
            />
          </>
        )}
      </section>
    </section>
  );
}
