"use client";
import {
  type ConsolidationSettings,
  consolidationSettingsResponseSchema,
  jobRunResponseSchema,
  listJobsResponseSchema,
  type UpdateConsolidationSettingsRequest
} from "@funes-vault/shared";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { useConfirm } from "../../../components/ui/confirmation-dialog";
import { emptyPagination } from "../../../components/ui/pagination";
import { useApiOwner, useApiUrl } from "../../../lib/api/api-context";
import { apiQueryKey, queryKeys } from "../../../lib/api/query-keys";
import {
  useApiMutation,
  useApiQuery,
  useInvalidateQueries
} from "../../../lib/api/use-api";
const emptySettings: Required<UpdateConsolidationSettingsRequest> = {
  enabled: false,
  mode: "REVIEW_ONLY"
};
const invalidate = [
  queryKeys.jobs.all,
  queryKeys.overview,
  queryKeys.audit.all,
  queryKeys.suggestions.all,
  queryKeys.memories.all
];
export function useJobsWorkspace() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const queryClient = useQueryClient();
  const apiUrl = useApiUrl();
  const ownerId = useApiOwner();
  const settingsQuery = useApiQuery({
    key: queryKeys.jobs.settings,
    path: "/v1/jobs/consolidation-settings",
    schema: consolidationSettingsResponseSchema
  });
  const jobsQuery = useApiQuery({
    retainPreviousPage: true,
    key: [...queryKeys.jobs.list(page), limit],
    path: `/v1/jobs?page=${page}&limit=${limit}`,
    schema: listJobsResponseSchema
  });
  const [draft, setDraft] =
    useState<Required<UpdateConsolidationSettingsRequest> | null>(null);
  const settings = draft ?? settingsQuery.data?.settings ?? emptySettings;
  const setSettings = (
    update: (
      current: Required<UpdateConsolidationSettingsRequest>
    ) => Required<UpdateConsolidationSettingsRequest>
  ) => setDraft(update(settings));
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const invalidateQueries = useInvalidateQueries();
  const save = useApiMutation({
    path: "/v1/jobs/consolidation-settings",
    method: "PATCH",
    schema: consolidationSettingsResponseSchema,
    body: (settings: UpdateConsolidationSettingsRequest) => settings,
    invalidate: [queryKeys.jobs.settings],
    onSuccess: (response) => {
      queryClient.setQueryData(
        apiQueryKey(apiUrl, queryKeys.jobs.settings, ownerId),
        response
      );
    }
  });
  const run = useApiMutation({
    path: "/v1/jobs/consolidation-runs",
    schema: jobRunResponseSchema,
    invalidate
  });
  const retry = useApiMutation({
    path: (id: string) => `/v1/jobs/${id}/retry`,
    method: "PATCH",
    schema: jobRunResponseSchema,
    body: () => undefined,
    invalidate
  });
  async function confirmAutoApply(settings: ConsolidationSettings) {
    if (
      settings.enabled &&
      settings.mode === "AUTO_APPLY" &&
      !(await confirm({
        title: "Enable auto-apply consolidation?",
        body: "Auto-apply can write consolidation output directly into active memory. Review-only keeps suggestions queued until you approve them.",
        confirmLabel: "Enable auto-apply",
        tone: "danger"
      }))
    ) {
      return false;
    }

    return true;
  }

  async function persistSettings(
    next: ConsolidationSettings,
    previousDraft: ConsolidationSettings | null
  ) {
    setMessage(null);
    setError(null);
    setDraft(next);
    try {
      await save.mutateAsync(next);
      setDraft(null);
      setMessage("Consolidation settings saved.");
    } catch {
      setDraft(previousDraft);
      setError("Could not save consolidation settings.");
    }
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(await confirmAutoApply(settings))) {
      return;
    }
    await persistSettings(settings, draft);
  }
  async function changeEnabled(enabled: boolean) {
    const next = { ...settings, enabled };
    if (!(await confirmAutoApply(next))) {
      return;
    }
    await persistSettings(next, draft);
  }
  async function runConsolidation() {
    setMessage(null);
    setError(null);
    try {
      await run.mutateAsync();
      setPage(1);
      setMessage("Consolidation job queued.");
    } catch {
      setError("Could not start consolidation.");
    }
  }
  async function retryJob(id: string) {
    setMessage(null);
    setError(null);
    try {
      await retry.mutateAsync(id);
      setPage(1);
      setMessage("Retry queued.");
    } catch {
      setError("Could not retry that job.");
    }
  }

  return {
    settings,
    setSettings,
    changeEnabled,
    jobs: jobsQuery.data?.items ?? [],
    selectedJobId,
    setSelectedJobId,
    jobsPagination: jobsQuery.data?.pagination ?? {
      ...emptyPagination(limit),
      page
    },
    isLoading: jobsQuery.isPending || settingsQuery.isPending,
    isSettingsLoading: settingsQuery.isPending,
    isSaving: save.isPending,
    isRunning: run.isPending,
    retryingJobId: retry.isPending ? retry.variables : null,
    message,
    error:
      error ??
      (jobsQuery.error || settingsQuery.error ? "Could not load jobs." : null),
    refresh: () => invalidateQueries(queryKeys.jobs.all),
    changeJobsPage: setPage,
    changeJobsLimit: (next: number) => {
      setLimit(next);
      setPage(1);
    },
    saveSettings,
    runConsolidation,
    retryJob
  };
}
