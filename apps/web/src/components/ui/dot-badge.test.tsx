import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { render } from "../../test/render";
import { DotBadge } from "./dot-badge";

describe("DotBadge", () => {
  it.each([
    "PUBLIC",
    "LOW",
    "INTERNAL",
    "SENSITIVE",
    "RESTRICTED",
    "SECRET"
  ] as const)(
    "renders the %s sensitivity with an accessible label",
    (value) => {
      const { container } = render(
        <DotBadge kind="sensitivity" value={value} showLabel={false} />
      );
      expect(container.firstElementChild?.getAttribute("data-value")).toBe(
        value.toLowerCase()
      );
      expect(
        screen.getByLabelText(value[0] + value.slice(1).toLowerCase())
      ).toBeTruthy();
    }
  );

  it("renders trust as visible text", () => {
    render(<DotBadge kind="trust" value="APPROVED" />);
    expect(screen.getByText("Approved")).toBeTruthy();
  });
});
