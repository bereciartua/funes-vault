"use client";
import { type RefObject, useEffect } from "react";
/** Modal drawers keep keyboard focus inside and restore their opener on close. */
export function useFocusTrap(
  open: boolean,
  container: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!open || !container.current) {
      return;
    }
    const opener = document.activeElement;
    const panel = container.current;
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
        )
      ).filter((element) => element.getClientRects().length > 0);
    (focusable()[0] ?? panel).focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab") {
        return;
      }
      const items = focusable();
      const first = items[0] ?? panel;
      const last = items.at(-1) ?? panel;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    panel.addEventListener("keydown", trap);

    return () => {
      panel.removeEventListener("keydown", trap);
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, [open, container]);
}
