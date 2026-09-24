import type { OverviewResponse } from "@funes-vault/shared";
import Link from "next/link";

import { DotBadge } from "../../components/ui/dot-badge";
import { RhythmGrid } from "../../components/viz/rhythm-grid";
import { Sparkline } from "../../components/viz/sparkline";
import { StackedBar } from "../../components/viz/stacked-bar";
import { formatRelative } from "../../lib/dates";
import { auditEventSummary } from "../../lib/domain/audit-summary";
import {
  policyRiskDescriptor,
  policySummary
} from "../../lib/domain/policy-summary";
import { sensitivityMixSummary } from "../../lib/domain/sensitivity";
import { routes } from "../../lib/routes";
import { pluralize } from "../../lib/text";
import { capturesThisWeek, weekdayExtremes } from "./capture-series";

export function PrivacyOverview({
  overview,
  providerNotice
}: {
  overview: OverviewResponse;
  providerNotice: string | null;
}) {
  const highestRiskPolicy = overview.broadestPolicy;
  const captures = capturesThisWeek(overview.captureSeries);

  return (
    <section className="overview-page" aria-label="Privacy overview">
      <header className="overview-hero">
        <p className="eyebrow">Privacy posture</p>
        <h1>Your vault at a glance</h1>
        <p>
          {pluralize(overview.memoryTotal, "active memory", "active memories")},{" "}
          {pluralize(overview.suggestionTotal, "pending suggestion")}, and{" "}
          {pluralize(overview.clientTotal, "registered app")}.
        </p>
      </header>

      <section className="overview-grid" aria-label="Vault signals">
        <Link className="signal-card" href="/vault">
          <div className="signal-head">
            <p className="eyebrow">Memories</p>
            <strong className="signal-value">{overview.memoryTotal}</strong>
          </div>
          <Sparkline
            values={overview.captureSeries.map((point) => point.count)}
          />
          <p className="signal-sub">
            Last 30 days · <b>{captures} this week</b>
          </p>
        </Link>

        <article className="signal-card">
          <div className="signal-head">
            <p className="eyebrow">Sensitivity</p>
            <strong className="signal-value">Mix</strong>
          </div>
          <StackedBar
            segments={overview.memorySensitivityCounts.map((item) => ({
              key: item.sensitivity,
              count: item.count
            }))}
          />
          <p className="signal-sub">
            {sensitivityMixSummary(overview.memorySensitivityCounts)}
          </p>
          {overview.recentHighSensitivityMemory ? (
            <Link
              className="overview-inline-link"
              href={routes.memory(overview.recentHighSensitivityMemory.id)}
            >
              <DotBadge
                kind="sensitivity"
                value={overview.recentHighSensitivityMemory.sensitivity}
              />
              <span>{overview.recentHighSensitivityMemory.title}</span>
            </Link>
          ) : null}
        </article>

        <article className="signal-card">
          <div className="signal-head">
            <p className="eyebrow">Rhythm</p>
            <strong className="signal-value">14d</strong>
          </div>
          <RhythmGrid
            values={overview.captureSeries
              .slice(-14)
              .map((point) => point.count)}
          />
          <p className="signal-sub">
            {weekdayExtremes(overview.captureSeries)}
          </p>
        </article>

        <Link className="signal-card" href="/inbox">
          <div className="signal-head">
            <p className="eyebrow">Review</p>
            <strong className="signal-value">{overview.suggestionTotal}</strong>
          </div>
          <p className="signal-sub">
            {overview.suggestionTotal === 0
              ? "Nothing waiting for review"
              : overview.oldestPendingSuggestionAt
                ? `Oldest arrived ${formatRelative(overview.oldestPendingSuggestionAt)}`
                : "Suggestions are waiting for review"}
          </p>
        </Link>

        <Link className="signal-card" href="/settings/clients">
          <div className="signal-head">
            <p className="eyebrow">Clients</p>
            <strong className="signal-value">{overview.clientTotal}</strong>
          </div>
          <div className="overview-dot-list">
            {overview.clientTrustCounts.map((item) => (
              <span key={item.trustLevel}>
                <DotBadge kind="trust" value={item.trustLevel} />
                <b>{item.count}</b>
              </span>
            ))}
          </div>
        </Link>

        <Link className="signal-card" href="/settings/clients">
          <div className="signal-head">
            <p className="eyebrow">Apps with permissions</p>
            <strong className="signal-value">{overview.policyTotal}</strong>
          </div>
          {highestRiskPolicy ? (
            <>
              <p className="overview-policy-tone">
                {
                  policyRiskDescriptor(
                    highestRiskPolicy,
                    overview.categoryTotal
                  ).label
                }
              </p>
              <p className="signal-sub">
                {policySummary(highestRiskPolicy, highestRiskPolicy.firstParty)}
              </p>
            </>
          ) : (
            <p className="signal-sub">
              No app permissions have been created yet.
            </p>
          )}
        </Link>

        <Link className="signal-card signal-card--wide" href="/settings/audit">
          <div className="signal-head">
            <p className="eyebrow">Recent activity</p>
            <strong className="signal-value">{overview.auditTotal}</strong>
          </div>
          <div className="overview-activity-list">
            {overview.recentAuditEvents.slice(0, 3).map((event) => {
              const summary = auditEventSummary(event);

              return (
                <span key={event.id}>
                  <i aria-hidden="true" data-tone={summary.tone} />
                  <time>{formatRelative(event.createdAt)}</time>
                  <b>{summary.description}</b>
                </span>
              );
            })}
            {overview.recentAuditEvents.length === 0 ? (
              <p className="signal-sub">No audit events yet.</p>
            ) : null}
          </div>
        </Link>

        <Link className="signal-card" href="/settings/data">
          <div className="signal-head">
            <p className="eyebrow">Chat context</p>
            <strong className="signal-value">
              {providerNotice ? "External" : "Vault"}
            </strong>
          </div>
          <p className="signal-sub">
            {providerNotice ??
              "Chat uses your vault. Memories may be saved directly when your app permissions allow it."}
          </p>
        </Link>
      </section>
    </section>
  );
}
