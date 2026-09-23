function pointsFor(values: number[]) {
  const safe = values.length > 0 ? values : [0, 0];
  const max = Math.max(...safe, 0);
  const min = Math.min(...safe, 0);
  const range = max - min;

  return safe.map((value, index) => {
    const x = safe.length === 1 ? 90 : (index / (safe.length - 1)) * 180;
    const y = range === 0 ? 30 : 32 - ((value - min) / range) * 28;

    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const;
  });
}

export function sparklinePath(values: number[]) {
  const points = pointsFor(values);

  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`)
    .join(" ");
}

export function Sparkline({ values }: { values: number[] }) {
  const line = sparklinePath(values);
  const area = `${line} L180 36 L0 36 Z`;

  return (
    <svg
      className="spark"
      viewBox="0 0 180 36"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="spark-area" d={area} />
      <path className="spark-line" d={line} />
    </svg>
  );
}
