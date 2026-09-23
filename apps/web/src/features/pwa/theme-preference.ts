import { brand } from "../../lib/brand";
export const THEME_STORAGE_KEY = "funes-vault-theme";

const themePreferences = ["auto", "light", "dark"] as const;

export type ThemePreference = (typeof themePreferences)[number];

const themeColors = {
  dark: brand.darkBackground,
  light: brand.lightBackground
} as const;

function isThemePreference(value: unknown): value is ThemePreference {
  return themePreferences.some((preference) => preference === value);
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readThemePreference(
  storage: Pick<Storage, "getItem"> | undefined = browserStorage()
): ThemePreference {
  if (!storage) {
    return "auto";
  }

  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);

    return isThemePreference(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function storeThemePreference(
  preference: ThemePreference,
  storage:
    Pick<Storage, "removeItem" | "setItem"> | undefined = browserStorage()
) {
  if (!storage) {
    return false;
  }

  try {
    if (preference === "auto") {
      storage.removeItem(THEME_STORAGE_KEY);

      return true;
    }

    storage.setItem(THEME_STORAGE_KEY, preference);

    return true;
  } catch {
    // The theme still applies for this page when storage is unavailable.
    return false;
  }
}

export function applyThemePreference(
  preference: ThemePreference,
  documentRoot: HTMLElement | undefined = typeof document === "undefined"
    ? undefined
    : document.documentElement,
  themeColorMetas: Iterable<HTMLMetaElement> = typeof document === "undefined"
    ? []
    : document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
) {
  if (!documentRoot) {
    return;
  }

  documentRoot.dataset.systemTheme =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  if (preference === "auto") {
    documentRoot.removeAttribute("data-theme");
  } else {
    documentRoot.dataset.theme = preference;
  }

  for (const meta of themeColorMetas) {
    if (preference !== "auto") {
      meta.content = themeColors[preference];
      continue;
    }

    meta.content = meta.media.includes("dark")
      ? themeColors.dark
      : themeColors.light;
  }
}

export const themeBootScript = `document.documentElement.dataset.systemTheme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";try{const theme=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(theme==="light"||theme==="dark"){document.documentElement.dataset.theme=theme}}catch{}`;
