import {
  render as renderDom,
  type RenderOptions
} from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as renderStatic } from "react-dom/server";

import { TooltipProvider } from "../components/ui/tooltip";
export function render(ui: ReactElement, options?: RenderOptions) {
  const result = renderDom(<TooltipProvider>{ui}</TooltipProvider>, options);

  return {
    ...result,
    rerender: (next: ReactElement) =>
      result.rerender(<TooltipProvider>{next}</TooltipProvider>)
  };
}
export function renderToStaticMarkup(children: ReactNode) {
  return renderStatic(<TooltipProvider>{children}</TooltipProvider>);
}
