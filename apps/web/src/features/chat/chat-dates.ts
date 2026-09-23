import { FunesUIMessage } from "./types";
export function chatDayKey(value?: string) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}
export function chatDayLabel(value: string, today = new Date()) {
  const date = new Date(value);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const key = chatDayKey(value);
  if (key === chatDayKey(today.toISOString())) {
    return "Today";
  }
  if (key === chatDayKey(yesterday.toISOString())) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric"
  }).format(date);
}
export function chatDateDividerLabel(
  messages: readonly FunesUIMessage[],
  index: number,
  today = new Date()
) {
  const createdAt = messages[index]?.metadata?.createdAt;
  const day = chatDayKey(createdAt);
  if (!createdAt || !day) {
    return null;
  }

  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previousDay = chatDayKey(
      messages[previousIndex]?.metadata?.createdAt
    );
    if (previousDay) {
      return previousDay === day ? null : chatDayLabel(createdAt, today);
    }
  }

  const firstDayLabel = chatDayLabel(createdAt, today);

  return firstDayLabel === "Today" ? null : firstDayLabel;
}
