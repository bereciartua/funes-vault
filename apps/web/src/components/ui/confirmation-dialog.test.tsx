import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render } from "../../test/render";
import { ConfirmationProvider, useConfirm } from "./confirmation-dialog";
function Trigger({ answer }: { answer: (value: boolean) => void }) {
  const confirm = useConfirm();

  return (
    <button
      onClick={() => {
        void confirm({
          title: "Delete record?",
          body: "This removes the record.",
          confirmLabel: "Delete record",
          tone: "danger"
        }).then(answer);
      }}
    >
      Request deletion
    </button>
  );
}
describe("confirmation provider", () => {
  it("resolves a shared dialog with the explicit owner choice", async () => {
    const answer = vi.fn();
    render(
      <ConfirmationProvider>
        <Trigger answer={answer} />
      </ConfirmationProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Request deletion" }));
    expect(
      await screen.findByRole("alertdialog", { name: "Delete record?" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await vi.waitFor(() => expect(answer).toHaveBeenCalledWith(false));
    fireEvent.click(screen.getByRole("button", { name: "Request deletion" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete record" })
    );
    await vi.waitFor(() => expect(answer).toHaveBeenLastCalledWith(true));
  });
  it("cancels a pending request when the provider unmounts", async () => {
    const answer = vi.fn();
    const view = render(
      <ConfirmationProvider>
        <Trigger answer={answer} />
      </ConfirmationProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Request deletion" }));
    view.unmount();
    await vi.waitFor(() => expect(answer).toHaveBeenCalledWith(false));
  });
});
