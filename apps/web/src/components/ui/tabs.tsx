import * as TabsPrimitive from "@radix-ui/react-tabs";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { classes } from "../../lib/classes";

type TabVariant = "nav" | "settings";

export const TabsRoot = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export const TabsList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={className} {...props} />
));

TabsList.displayName = "TabsList";

type TabsTriggerProps = ComponentPropsWithoutRef<
  typeof TabsPrimitive.Trigger
> & {
  variant?: TabVariant;
};

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, variant = "nav", ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={classes([
        "ui-button",
        `ui-button--${variant}`,
        "ui-tabs-trigger",
        className
      ])}
      {...props}
    />
  )
);

TabsTrigger.displayName = "TabsTrigger";
