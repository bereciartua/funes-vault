export type CaptureSeriesPoint = { date: string; count: number };

export function capturesThisWeek(series: CaptureSeriesPoint[]) {
  return series.slice(-7).reduce((sum, point) => sum + point.count, 0);
}

export function weekdayExtremes(series: CaptureSeriesPoint[]) {
  if (series.length === 0) {
    return "No capture rhythm yet";
  }
  const totals = new Map<number, number>();
  for (const point of series) {
    const weekday = new Date(`${point.date}T00:00:00.000Z`).getUTCDay();
    totals.set(weekday, (totals.get(weekday) ?? 0) + point.count);
  }
  const entries = [...totals.entries()].sort((a, b) => a[0] - b[0]);
  const format = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    timeZone: "UTC"
  });
  const name = (weekday: number) =>
    format.format(new Date(Date.UTC(2026, 6, 5 + weekday)));
  const busiest = entries.reduce((best, item) =>
    item[1] > best[1] ? item : best
  );
  const quietest = entries.reduce((best, item) =>
    item[1] < best[1] ? item : best
  );

  return `${name(busiest[0])} busiest · ${name(quietest[0])} quietest`;
}
