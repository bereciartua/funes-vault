import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "../test/render";
import { AuthForm } from "./AuthForm";

afterEach(cleanup);
describe("demo sign-in", () => {
  it("hides demo login unless the server offers it", () => {
    render(<AuthForm loginUrl="/auth/google" error={null} />);
    expect(
      screen.queryByRole("button", { name: "Use demo account" })
    ).toBeNull();
  });
  it("submits once and disables the button while opening the vault", () => {
    const login = vi.fn();
    const view = render(
      <AuthForm loginUrl="/auth/google" error={null} onDemoLogin={login} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Use demo account" }));
    expect(login).toHaveBeenCalledTimes(1);
    view.rerender(
      <AuthForm
        loginUrl="/auth/google"
        error={null}
        onDemoLogin={login}
        isDemoLoading
      />
    );
    const pending = screen.getByRole("button", { name: "Opening demo vault…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pending);
    expect(login).toHaveBeenCalledTimes(1);
  });
});
