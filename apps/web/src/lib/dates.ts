const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium"
});

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  return dateTimeFormat.format(new Date(value));
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  return dateFormat.format(new Date(value));
}

export function toDateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

const chatThreadActivityFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export function formatChatTimestamp(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return dateTimeFormat.format(date);
}

export function formatThreadActivity(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return chatThreadActivityFormat.format(date);
}

const relativeFormat = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto"
});

const relativeSteps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60]
];

export function formatRelative(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const elapsed = new Date(value).getTime() - Date.now();

  for (const [unit, size] of relativeSteps) {
    if (Math.abs(elapsed) >= size) {
      return relativeFormat.format(Math.round(elapsed / size), unit);
    }
  }

  return "just now";
}

const shortDateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric"
});

const timeOnlyFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit"
});

export function feedTime(
  value: string | Date | null | undefined,
  now = new Date()
) {
  if (!value) {
    return "Not started";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return sameDay ? timeOnlyFormat.format(date) : shortDateFormat.format(date);
}

export function toExpiresAtIso(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}
