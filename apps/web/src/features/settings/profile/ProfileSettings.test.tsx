import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installApiMock } from "../../../test/api-mock";
import { queryWrapper } from "../../../test/query-wrapper";
import { render } from "../../../test/render";
import { ProfileSettings } from "./ProfileSettings";
afterEach(() => vi.unstubAllGlobals());
describe("profile settings", () => {
  it("saves a trimmed display name and updates the active identity", async () => {
    const user = {
      id: "owner",
      email: "owner@example.com",
      displayName: null,
      role: "USER" as const
    };
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {}
    }));
    const fetch = installApiMock([
      {
        path: "/v1/memory-processing/capabilities",
        response: {
          fingerprint: "test",
          extraction: {
            system: "system_2",
            model: "test",
            available: false,
            processors: []
          },
          consolidation: {
            system: "system_2",
            model: "test",
            available: false,
            processors: [],
            maxSensitivity: "INTERNAL"
          },
          consents: []
        }
      },
      {
        method: "PATCH",
        path: "/auth/me",
        response: { user: { ...user, displayName: "Morgan" } }
      }
    ]);
    const onUserUpdated = vi.fn();
    render(<ProfileSettings user={user} onUserUpdated={onUserUpdated} />, {
      wrapper: queryWrapper().wrapper
    });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "  Morgan  " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Profile updated.");
    expect(
      fetch.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body
    ).toBe(JSON.stringify({ displayName: "Morgan" }));
    expect(onUserUpdated).toHaveBeenCalledWith({
      ...user,
      displayName: "Morgan"
    });
  });
});
