import { describe, expect, it } from "vitest";

import { render } from "../../test/render";
import { Sparkline, sparklinePath } from "./sparkline";

describe("Sparkline", () => {
  it("constructs a stable path", () => {
    expect(sparklinePath([0, 2, 1])).toBe("M0 32 L90 4 L180 18");
  });

  it.each<[number[]]>([[[]], [[0, 0, 0]]])(
    "renders a finite flat baseline",
    (values) => {
      const { container } = render(<Sparkline values={values} />);
      const d = container.querySelector("path:last-child")?.getAttribute("d");
      expect(d).not.toContain("NaN");
      expect(d).toContain("30");
    }
  );

  it("renders one point without a degenerate edge path or dash pattern", () => {
    const { container } = render(<Sparkline values={[4]} />);
    const line = container.querySelector("path:last-child");
    expect(line?.getAttribute("d")).toBe("M90 4");
    expect(line?.hasAttribute("pathLength")).toBe(false);
    expect(line?.getAttribute("stroke-dasharray")).toBeNull();
  });
});
