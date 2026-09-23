"use client";
import { useSyncExternalStore } from "react";

import {
  applyThemePreference,
  readThemePreference,
  storeThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference
} from "./theme-preference";
const eventName = "funes:theme-preference";
let pagePreference: ThemePreference | undefined;
function currentPreference() {
  return pagePreference ?? readThemePreference();
}
function subscribe(notify: () => void) {
  const listener = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) {
      pagePreference = undefined;
      notify();
    }
  };
  window.addEventListener("storage", listener);
  window.addEventListener(eventName, notify);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(eventName, notify);
  };
}
function setPreference(preference: ThemePreference) {
  applyThemePreference(preference);
  pagePreference = storeThemePreference(preference) ? undefined : preference;
  window.dispatchEvent(new Event(eventName));
}
export function useThemePreference() {
  const preference = useSyncExternalStore(
    subscribe,
    currentPreference,
    () => "auto" as const
  );

  return [preference, setPreference] as const;
}
