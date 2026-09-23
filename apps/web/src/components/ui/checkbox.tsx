import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { type ReactNode } from "react";

import { classes } from "../../lib/classes";

type CheckboxFieldProps = {
  checked: boolean;
  children: ReactNode;
  className?: string;
  onCheckedChange: (checked: boolean) => void;
};

export function CheckboxField({
  checked,
  children,
  className,
  onCheckedChange
}: CheckboxFieldProps) {
  return (
    <label className={classes(["ui-checkbox-field", className])}>
      <CheckboxPrimitive.Root
        checked={checked}
        className="ui-checkbox-root"
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
      >
        <CheckboxPrimitive.Indicator className="ui-checkbox-indicator">
          <Check aria-hidden="true" size={15} strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span>{children}</span>
    </label>
  );
}
