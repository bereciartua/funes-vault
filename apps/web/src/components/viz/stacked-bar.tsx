import type { CSSProperties } from "react";

export type StackedBarSegment = {
  key: string;
  count: number;
};

export function StackedBar({ segments }: { segments: StackedBarSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  return (
    <div className="stack-bar" data-empty={total === 0} aria-hidden="true">
      {total > 0
        ? segments
            .filter((segment) => segment.count > 0)
            .map((segment) => (
              <i
                key={segment.key}
                style={
                  {
                    "--stack-color": `var(--tier-${segment.key.toLowerCase()})`,
                    "--stack-grow": segment.count
                  } as CSSProperties
                }
              />
            ))
        : null}
    </div>
  );
}
