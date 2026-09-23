import type { CSSProperties } from "react";

export function RhythmGrid({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);

  return (
    <div className="rhythm-grid" aria-hidden="true">
      {values.map((value, index) => (
        <i
          key={index}
          title={`${value} ${value === 1 ? "capture" : "captures"}`}
          style={
            {
              "--rhythm-opacity": max === 0 ? 0.15 : 0.15 + 0.85 * (value / max)
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
