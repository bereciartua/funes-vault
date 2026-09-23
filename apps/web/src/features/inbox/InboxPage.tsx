"use client";
import "./inbox.css";

import type { ReviewableMemorySuggestion } from "@funes-vault/shared";
import { useState } from "react";

import { useConfirm } from "../../components/ui/confirmation-dialog";
import { emptyPagination } from "../../components/ui/pagination";
import { errorCopy } from "../../lib/api/error-copy";
import { pluralize } from "../../lib/text";
import { InboxSurface } from "./components/InboxSurface";
import { useSuggestionReview } from "./hooks/use-suggestion-review";
import { useSuggestions } from "./hooks/use-suggestions";
import { duplicateSuggestionIds } from "./suggestion-selection";

export function InboxPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const query = useSuggestions(page, limit);
  const { single, bulk } = useSuggestionReview();
  const confirm = useConfirm();
  const suggestions = query.data?.items ?? [];
  const selectedIds = new Set(
    suggestions.filter((item) => selected.has(item.id)).map((item) => item.id)
  );
  const pagination = query.data?.pagination ?? emptyPagination(limit);
  function changePage(next: number) {
    setPage(next);
    setSelected(new Set());
  }
  async function review(id: string, action: "apply" | "reject") {
    setFailure(null);
    setMessage(null);
    try {
      await single.mutateAsync({ id, action });
      setSelected(
        (current) => new Set([...current].filter((value) => value !== id))
      );
      setMessage(
        action === "apply" ? "Suggestion applied." : "Suggestion rejected."
      );
      if (suggestions.length === 1 && page > 1) {
        changePage(page - 1);
      }
    } catch (error) {
      setFailure(errorCopy(error, "Could not review this suggestion."));
    }
  }
  async function reject(suggestion: ReviewableMemorySuggestion) {
    if (
      await confirm({
        title: "Reject suggestion?",
        body: `Reject "${suggestion.title}" and remove it from the review inbox.`,
        confirmLabel: "Reject suggestion",
        tone: "danger"
      })
    ) {
      await review(suggestion.id, "reject");
    }
  }
  async function reviewSelected(action: "apply" | "reject") {
    const ids = [...selectedIds];
    if (!ids.length) {
      return;
    }
    const verb = action === "apply" ? "Apply" : "Reject";
    if (
      !(await confirm({
        title: `${verb} ${pluralize(ids.length, "suggestion")}?`,
        body:
          action === "apply"
            ? "Applied suggestions become active memories that policies can share with approved clients."
            : "Rejected suggestions are removed from the review inbox. This cannot be undone.",
        confirmLabel: `${verb} all selected`,
        tone: action === "reject" ? "danger" : "default"
      }))
    ) {
      return;
    }
    setFailure(null);
    setMessage(null);
    try {
      const result = await bulk.mutateAsync({ ids, action });
      setSelected(
        new Set(
          result.results
            .filter((item) => item.status === "failed")
            .map((item) => item.id)
        )
      );
      setMessage(
        `${action === "apply" ? "Applied" : "Rejected"} ${pluralize(result.succeeded, "suggestion")}.`
      );
      if (result.failed) {
        setFailure(
          `${pluralize(result.failed, "suggestion")} could not be reviewed. Refresh and try again.`
        );
      }
      if (result.succeeded === suggestions.length && page > 1) {
        changePage(page - 1);
      }
    } catch (error) {
      setFailure(
        errorCopy(error, "Could not review the selected suggestions.")
      );
    }
  }
  if (query.isPending) {
    return <p role="status">Loading suggestions...</p>;
  }

  return (
    <InboxSurface
      suggestions={suggestions}
      suggestionsPagination={pagination}
      selectedSuggestionIds={selectedIds}
      suggestionDuplicateIds={duplicateSuggestionIds(suggestions)}
      allSuggestionsSelected={
        suggestions.length > 0 && selectedIds.size === suggestions.length
      }
      isBulkReviewing={bulk.isPending}
      reviewingSuggestionId={
        single.isPending ? (single.variables?.id ?? null) : null
      }
      error={failure ?? (query.error ? errorCopy(query.error) : null)}
      message={message}
      onApplySuggestion={(id) => review(id, "apply")}
      onConfirmRejectSuggestion={reject}
      onReviewSelectedSuggestions={reviewSelected}
      onChangeSuggestionsPage={changePage}
      onChangeSuggestionsLimit={(next) => {
        setLimit(next);
        changePage(1);
      }}
      onSelectDuplicateSuggestions={() =>
        setSelected(duplicateSuggestionIds(suggestions))
      }
      onSelectPageSuggestions={(checked) =>
        setSelected(new Set(checked ? suggestions.map((item) => item.id) : []))
      }
      onToggleSuggestionSelected={(id) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }

          return next;
        })
      }
    />
  );
}
