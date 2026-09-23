export type SettingsSection =
  "profile" | "jobs" | "data" | "clients" | "audit" | "requests";

export const settingsSections = [
  "profile",
  "jobs",
  "data",
  "clients",
  "audit",
  "requests"
] as const satisfies readonly SettingsSection[];
