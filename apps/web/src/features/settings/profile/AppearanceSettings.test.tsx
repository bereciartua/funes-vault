import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { render } from "../../../test/render";
import { THEME_STORAGE_KEY } from "../../pwa/theme-preference";
import { AppearanceSettings } from "./AppearanceSettings";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => cleanup());

describe("AppearanceSettings", () => {
  it("loads and immediately applies a saved appearance preference", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(<AppearanceSettings />);

    expect(
      await screen.findByRole("radio", { name: "Dark", checked: true })
    ).toBeTruthy();
    expect(screen.getByText(/stays dark/)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("light")
    );
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("returns to the system preference when Auto is selected", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<AppearanceSettings />);
    await screen.findByRole("radio", { name: "Dark", checked: true });

    fireEvent.click(screen.getByRole("radio", { name: "Auto" }));

    await waitFor(() =>
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false)
    );
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(screen.getByText(/follows this device/)).toBeTruthy();
  });
});
