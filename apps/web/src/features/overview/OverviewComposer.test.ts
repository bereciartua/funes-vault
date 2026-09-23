import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { renderToStaticMarkup } from "../../test/render";
import { shouldSubmitComposerKey } from "../chat/components/ChatComposer";
import { OverviewChatComposer } from "./OverviewComposer";

describe("composer", () => {
  it("renders the overview chat composer", () => {
    const html = renderToStaticMarkup(
      createElement(OverviewChatComposer, {
        error: null,
        onSubmit: async () => undefined
      })
    );

    expect(html).toContain("Ask your vault");
    expect(html).toContain("Tell me something, or ask what I know…");
    expect(html).toContain("Send to your vault");
    expect(html).not.toContain("Start a voice conversation");
  });
  it("offers a voice entry from the overview composer when wired", () => {
    const html = renderToStaticMarkup(
      createElement(OverviewChatComposer, {
        error: null,
        onSubmit: async () => undefined,
        onStartVoice: () => undefined
      })
    );

    expect(html).toContain("Start a voice conversation");
  });
  it("submits the overview composer on Enter but not Shift+Enter", () => {
    expect(shouldSubmitComposerKey({ key: "Enter", shiftKey: false })).toBe(
      true
    );
    expect(shouldSubmitComposerKey({ key: "Enter", shiftKey: true })).toBe(
      false
    );
    expect(shouldSubmitComposerKey({ key: "a", shiftKey: false })).toBe(false);
  });
});
