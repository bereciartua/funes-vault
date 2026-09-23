import { isSettingsSection } from "../features/settings/sections";
import { routes } from "../lib/routes";
// Compatibility for private-preview links. Remove after 2027-03-22.
export function normalizeSettingsSection(value: string | null | undefined) {
  if (value === "policies") {
    return "clients";
  }

  return isSettingsSection(value ?? null)
    ? (value as import("../features/settings/sections").SettingsSection)
    : null;
}
function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function legacySurfaceRedirect(
  params: Record<string, string | string[] | undefined>
) {
  const requestId = firstParam(params.memoryRequestId);
  if (requestId) {
    return routes.request(requestId);
  }
  if (firstParam(params.memorySuggestionId)) {
    return "/inbox";
  }
  const surface = firstParam(params.surface);
  const memoryId = firstParam(params.memoryId);
  const settings = firstParam(params.settings);
  const threadId = firstParam(params.threadId);

  if (!surface) {
    return null;
  }

  if (surface === "vault") {
    return memoryId ? routes.memory(memoryId) : "/vault";
  }

  if (surface === "chat") {
    return threadId ? routes.chatThread(threadId) : "/chat";
  }

  if (surface === "inbox") {
    return "/inbox";
  }

  if (
    surface === "settings" ||
    surface === "profile" ||
    surface === "jobs" ||
    surface === "data" ||
    surface === "clients" ||
    surface === "audit" ||
    surface === "policies"
  ) {
    const section = normalizeSettingsSection(
      surface === "settings" ? (settings ?? "profile") : surface
    );

    return routes.settings(section ?? "profile");
  }

  if (surface === "overview") {
    return "/overview";
  }

  return null;
}
