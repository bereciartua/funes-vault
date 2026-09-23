import { describe, expect, it } from "vitest";

import { render } from "../../test/render";
import { DotBadge } from "../ui/dot-badge";
import { StackedBar } from "./stacked-bar";

describe("StackedBar", () => {
  it("renders proportional segments", () => {
    const { container } = render(
      <StackedBar segments={[{ key: "PUBLIC", count: 2 }]} />
    );
    expect(container.querySelectorAll("i")).toHaveLength(1);
  });

  it("renders an empty track for a zero total", () => {
    const { container } = render(
      <StackedBar segments={[{ key: "PUBLIC", count: 0 }]} />
    );
    expect(container.firstElementChild?.getAttribute("data-empty")).toBe(
      "true"
    );
    expect(container.querySelectorAll("i")).toHaveLength(0);
  });

  it("omits zero tiers and shares the tier variable with dot badges", () => {
    const { container } = render(
      <>
        <StackedBar
          segments={[
            { key: "PUBLIC", count: 3 },
            { key: "LOW", count: 0 },
            { key: "SECRET", count: 1 }
          ]}
        />
        <DotBadge kind="sensitivity" value="PUBLIC" />
      </>
    );
    const segments =
      container.firstElementChild!.querySelectorAll<HTMLElement>("i");
    expect(segments).toHaveLength(2);
    expect(segments[0]?.style.getPropertyValue("--stack-color")).toBe(
      "var(--tier-public)"
    );
    expect(container.querySelector('[data-value="public"]')).not.toBeNull();
  });
});
