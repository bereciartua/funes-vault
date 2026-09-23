import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyThemePreference,
  readThemePreference,
  storeThemePreference,
  THEME_STORAGE_KEY,
  themeBootScript
} from "./theme-preference";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("theme preference", () => {
  it("treats missing and invalid stored values as auto", () => {
    expect(readThemePreference()).toBe("auto");

    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readThemePreference()).toBe("auto");
  });

  it("persists forced themes and removes storage for auto", () => {
    storeThemePreference("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    storeThemePreference("auto");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("applies forced themes and restores media-aware theme colors for auto", () => {
    const lightMeta = document.createElement("meta");
    lightMeta.media = "(prefers-color-scheme: light)";
    const darkMeta = document.createElement("meta");
    darkMeta.media = "(prefers-color-scheme: dark)";

    applyThemePreference("dark", document.documentElement, [
      lightMeta,
      darkMeta
    ]);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(lightMeta.content).toBe("#0f1722");
    expect(darkMeta.content).toBe("#0f1722");

    applyThemePreference("auto", document.documentElement, [
      lightMeta,
      darkMeta
    ]);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(lightMeta.content).toBe("#f4f6f8");
    expect(darkMeta.content).toBe("#0f1722");
  });

  it("applies a stored forced theme during the pre-paint boot script", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    Function(
      "localStorage",
      "document",
      themeBootScript
    )(window.localStorage, document);

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("keeps working when browser storage is unavailable", () => {
    const unavailableStorage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      removeItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      })
    };

    expect(readThemePreference(unavailableStorage)).toBe("auto");
    expect(() =>
      storeThemePreference("dark", unavailableStorage)
    ).not.toThrow();
  });
});
