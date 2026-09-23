import { describe, expect, it } from "vitest";

import { render } from "../../test/render";
import { RhythmGrid } from "./rhythm-grid";

describe("RhythmGrid", () => {
  it("guards the zero maximum and names each cell", () => {
    const { container } = render(<RhythmGrid values={[0, 0]} />);
    expect(container.querySelectorAll("i")).toHaveLength(2);
    expect(container.querySelector("i")?.getAttribute("style")).not.toContain(
      "NaN"
    );
    expect(container.querySelector("i")?.getAttribute("title")).toBe(
      "0 captures"
    );
  });
});
