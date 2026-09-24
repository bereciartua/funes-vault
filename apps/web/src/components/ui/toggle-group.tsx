"use client";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

export type ToggleGroupOption<T extends string = string> = {
  label: string;
  value: T;
};

type ToggleGroupFieldProps<T extends string> = {
  ariaLabel: string;
  disabled?: boolean;
  options: ToggleGroupOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
};

export function ToggleGroupField<T extends string>({
  ariaLabel,
  disabled,
  onValueChange,
  options,
  value
}: ToggleGroupFieldProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      aria-label={ariaLabel}
      className="segmented-control"
      disabled={disabled}
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        const option = options.find(
          (candidate) => candidate.value === nextValue
        );
        if (option) {
          onValueChange(option.value);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          className="ui-button ui-button--settings ui-toggle-group-item"
          value={option.value}
        >
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
