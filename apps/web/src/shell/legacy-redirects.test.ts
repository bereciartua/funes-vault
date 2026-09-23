import { describe, expect, it } from "vitest";

import { routes } from "../lib/routes";
import {
  legacySurfaceRedirect,
  normalizeSettingsSection
} from "./legacy-redirects";
describe("private-preview link compatibility", () => {
  it("preserves old deep links and canonicalizes the policies alias", () => {
    expect(
      legacySurfaceRedirect({ surface: "vault", memoryId: "one & two" })
    ).toBe(routes.memory("one & two"));
    expect(
      legacySurfaceRedirect({ surface: "chat", threadId: "thread / one" })
    ).toBe(routes.chatThread("thread / one"));
    expect(legacySurfaceRedirect({ memoryRequestId: "request?one" })).toBe(
      routes.request("request?one")
    );
    expect(legacySurfaceRedirect({ surface: "policies" })).toBe(
      routes.settings("clients")
    );
    expect(legacySurfaceRedirect({ surface: ["overview", "chat"] })).toBe(
      "/overview"
    );
    expect(legacySurfaceRedirect({})).toBeNull();
    expect(normalizeSettingsSection("policies")).toBe("clients");
    expect(normalizeSettingsSection("nonsense")).toBeNull();
  });
});
