"use client";
import type { AuthUser, OverviewResponse } from "@funes-vault/shared";
import Link from "next/link";
import { useEffect, useState } from "react";

import { RhythmGrid } from "../../components/viz/rhythm-grid";
import { Sparkline } from "../../components/viz/sparkline";
import { StackedBar } from "../../components/viz/stacked-bar";
import { useCountUp } from "../../components/viz/use-count-up";
import { sensitivityMixSummary } from "../../lib/domain/sensitivity";
import { pluralize } from "../../lib/text";
import { capturesThisWeek, weekdayExtremes } from "./capture-series";
import { captureSeriesText, greetingForHour } from "./home-surface-helpers";
import { OverviewChatComposer } from "./OverviewComposer";

export function HomeSurface({
  overview,
  user,
  error,
  onStartChat,
  onStartVoice
}: {
  overview: OverviewResponse;
  user: AuthUser;
  error: string | null;
  onStartChat: (message: string) => Promise<void>;
  onStartVoice: () => void;
}) {
  const memoryTotal = useCountUp(overview.memoryTotal);
  const captures = capturesThisWeek(overview.captureSeries);
  const approved =
    overview.clientTrustCounts.find((item) => item.trustLevel === "APPROVED")
      ?.count ?? 0;
  const [greeting, setGreeting] = useState<string | null>(null);
  const name = user.displayName?.trim();

  useEffect(() => {
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  return (
    <section className="home-page" aria-label="Home">
      <div className="home-center">
        <h1>
          <span className="home-greeting-line">
            {greeting ? `Good ${greeting}` : "Welcome"}
            {name ? `, ${name}` : ""}.
          </span>{" "}
          <span className="home-question-line">What should I remember?</span>
        </h1>
        <OverviewChatComposer
          error={error}
          onSubmit={onStartChat}
          onStartVoice={onStartVoice}
        />

        <section className="home-signals" aria-label="Vault signals">
          <Link className="signal-card" href="/overview">
            <div className="signal-head">
              <p className="eyebrow">Memories</p>
              <strong className="signal-value">{memoryTotal}</strong>
            </div>
            <Sparkline
              values={overview.captureSeries.map((item) => item.count)}
            />
            <p className="signal-sub">
              Last 30 days · <b>{captures} this week</b>
            </p>
          </Link>

          <Link className="signal-card" href="/vault">
            <div className="signal-head">
              <p className="eyebrow">Sensitivity</p>
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
          </Link>

          <Link className="signal-card" href="/overview">
            <div className="signal-head">
              <p className="eyebrow">Rhythm</p>
            </div>
            <RhythmGrid
              values={overview.captureSeries
                .slice(-14)
                .map((item) => item.count)}
            />
            <p className="signal-sub">
              {weekdayExtremes(overview.captureSeries)}
            </p>
          </Link>
        </section>

        <p className="home-footer-status">
          {overview.suggestionTotal > 0 ? (
            <>
              <Link href="/inbox">
                {pluralize(overview.suggestionTotal, "suggestion")} waiting for
                review
              </Link>
              <span aria-hidden="true"> · </span>
            </>
          ) : null}
          <span>{captureSeriesText(approved)}</span>
        </p>
      </div>
    </section>
  );
}
