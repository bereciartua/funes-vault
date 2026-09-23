import type { SettingsSection } from "./settings-routes";
export const routes = {
  auditEvent: (id: string) =>
    `/settings/audit?eventId=${encodeURIComponent(id)}` as const,
  memory: (id: string) => `/vault?memoryId=${encodeURIComponent(id)}` as const,
  chatThread: (id: string) => `/chat/${encodeURIComponent(id)}` as const,
  settings: (section: SettingsSection) => `/settings/${section}` as const,
  request: (id: string) =>
    `/settings/requests?requestId=${encodeURIComponent(id)}` as const
};
