import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { type ReactNode, type RefObject } from "react";

import { classes } from "../../lib/classes";

type ScrollAreaProps = {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  viewportRef?: RefObject<HTMLDivElement | null>;
};

export function ScrollArea({
  ariaLabel,
  children,
  className,
  contentClassName,
  viewportRef
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      aria-label={ariaLabel}
      className={classes(["ui-scroll-area", className])}
      data-scroll-area="true"
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        className="ui-scroll-area-viewport"
      >
        <div className={contentClassName}>{children}</div>
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        className="ui-scroll-area-scrollbar"
        orientation="vertical"
      >
        <ScrollAreaPrimitive.Thumb className="ui-scroll-area-thumb" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
