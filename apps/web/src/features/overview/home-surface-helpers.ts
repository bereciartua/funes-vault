export function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) {
    return "morning";
  }
  if (hour >= 12 && hour < 18) {
    return "afternoon";
  }

  return "evening";
}

export function captureSeriesText(approvedClients: number) {
  if (approvedClients === 0) {
    return "No apps have approved access";
  }

  return `${approvedClients} approved ${approvedClients === 1 ? "app" : "apps"}`;
}
