"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { type ReactNode } from "react";

type SwitchFieldProps = {
  checked: boolean;
  children: ReactNode;
  onCheckedChange: (checked: boolean) => void;
};

export function SwitchField({
  checked,
  children,
  onCheckedChange
}: SwitchFieldProps) {
  return (
    <label className="ui-switch-field">
      <SwitchPrimitive.Root
        checked={checked}
        className="ui-switch-root"
        onCheckedChange={onCheckedChange}
      >
        <SwitchPrimitive.Thumb className="ui-switch-thumb" />
      </SwitchPrimitive.Root>
      <span>{children}</span>
    </label>
  );
}
