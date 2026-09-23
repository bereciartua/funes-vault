import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { render } from "../../../test/render";
import { InstallApp } from "./InstallApp";

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("provides phone installation guidance without requiring a browser prompt", () => {
  render(<InstallApp />);
  expect(screen.getByText(/Add to Home Screen/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Install Funes" })).toBeNull();
});
it("offers an available installation prompt and reflects successful installation", async () => {
  render(<InstallApp />);
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) }
  );
  fireEvent(window, event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Install Funes" }));
  await waitFor(() =>
    expect(screen.getByText(/using the installed app/)).toBeTruthy()
  );
  expect(prompt).toHaveBeenCalledOnce();
});
it("recognizes standalone mode", () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
  render(<InstallApp />);
  expect(screen.getByText(/using the installed app/)).toBeTruthy();
});
