"use client";
import { useEffect } from "react";

import { applyThemePreference } from "./theme-preference";
import { useThemePreference } from "./use-theme-preference";
export function ThemeManager() {
  const [preference] = useThemePreference();
  useEffect(() => {
    const apply = () => applyThemePreference(preference);
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);

    return () => media.removeEventListener("change", apply);
  }, [preference]);

  return null;
}
