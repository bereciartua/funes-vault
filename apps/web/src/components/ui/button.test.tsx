import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { render } from "../../test/render";
import { DeleteButton } from "./button";

describe("DeleteButton", () => {
  it("uses the shared danger treatment with an icon and concise label", () => {
    const { container } = render(<DeleteButton type="button" />);
    const button = screen.getByRole("button", { name: "Delete" });

    expect(button.getAttribute("type")).toBe("button");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true"
    );
  });
});
