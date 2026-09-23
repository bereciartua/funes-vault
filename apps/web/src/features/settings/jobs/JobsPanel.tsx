"use client";
import { Button } from "../../../components/ui/button";
import { FeedbackMessages } from "../../../components/ui/feedback-messages";
import { PaginationControls } from "../../../components/ui/pagination";
import { SwitchField } from "../../../components/ui/switch";
import { ToggleGroupField } from "../../../components/ui/toggle-group";
import { feedTime } from "../../../lib/dates";
import { label } from "../../../lib/domain/labels";
import { FeedRow, SettingsPane } from "../settings-scaffolding";
import { jobRunSentence, jobTone } from "./job-presentation";
import { JobRunDetail } from "./JobRunDetail";
import { useJobsWorkspace } from "./use-jobs-workspace";
export function JobsPanel() {
  const {
    settings,
    setSettings,
    jobs,
    selectedJobId,
    setSelectedJobId,
    jobsPagination,
    isLoading,
    isSaving,
    isRunning,
    retryingJobId,
    message,
    error,
    refresh,
    changeJobsPage,
    changeJobsLimit,
    saveSettings,
    runConsolidation,
    retryJob
  } = useJobsWorkspace();

  return (
    <SettingsPane
      title="Background jobs"
      description="Control reviewable consolidation and inspect recent work."
    >
      <FeedbackMessages message={message} />
      <FeedbackMessages error={error} />

      <section className="settings-section" aria-label="Consolidation settings">
        <p className="eyebrow">Consolidation</p>
        <form className="settings-form" onSubmit={saveSettings}>
          <div className="settings-control-row">
            <SwitchField
              checked={settings.enabled}
              onCheckedChange={(enabled) =>
                setSettings((current) => ({ ...current, enabled }))
              }
            >
              Run consolidation daily
            </SwitchField>
            <p className="setting-help">
              {settings.enabled
                ? "Consolidation runs once a day."
                : "Currently off. Turn on to consolidate once a day."}
            </p>
          </div>

          <div className="settings-control-row">
            <span className="field-label">Mode</span>
            <ToggleGroupField
              ariaLabel="Consolidation mode"
              value={settings.mode}
              options={(["REVIEW_ONLY", "AUTO_APPLY"] as const).map((mode) => ({
                label: label(mode),
                value: mode
              }))}
              onValueChange={(mode) =>
                setSettings((current) => ({
                  ...current,
                  mode
                }))
              }
            />
            <p className="setting-help">
              {settings.mode === "REVIEW_ONLY"
                ? "Review-only queues consolidation output as suggestions."
                : "Auto-apply writes output directly into active memory."}
            </p>
          </div>

          <div className="form-actions">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isRunning}
              onClick={runConsolidation}
            >
              {isRunning ? "Starting..." : "Run now"}
            </Button>
          </div>
        </form>
      </section>

      <section className="settings-section" aria-label="Recent job runs">
        <div className="settings-section-heading">
          <p className="eyebrow">Recent runs</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
        </div>
        {isLoading ? <p className="muted">Loading…</p> : null}
        {!isLoading && jobs.length === 0 ? (
          <p className="muted">
            No runs yet. Run consolidation to see results here.
          </p>
        ) : null}
        <div className="feed-list">
          {jobs.map((job) => {
            const expanded = selectedJobId === job.id;

            return (
              <FeedRow
                key={job.id}
                id={`job-${job.id}`}
                time={feedTime(job.startedAt ?? job.createdAt)}
                tone={jobTone(job.status)}
                expanded={expanded}
                onToggle={() =>
                  setSelectedJobId((current) =>
                    current === job.id ? null : job.id
                  )
                }
                details={
                  <JobRunDetail
                    job={job}
                    retrying={retryingJobId === job.id}
                    onRetry={() => void retryJob(job.id)}
                  />
                }
              >
                {jobRunSentence(job)}
              </FeedRow>
            );
          })}
        </div>
        <PaginationControls
          disabled={isLoading}
          itemLabel="job"
          nextLabel="Older"
          pagination={jobsPagination}
          previousLabel="Newer"
          variant="stream"
          onLimitChange={changeJobsLimit}
          onPageChange={changeJobsPage}
        />
      </section>
    </SettingsPane>
  );
}
