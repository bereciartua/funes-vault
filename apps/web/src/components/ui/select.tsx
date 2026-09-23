"use client";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

const EMPTY_VALUE = "__funes_empty_value__";

type SelectOption<T extends string = string> = {
  disabled?: boolean;
  label: string;
  value: T;
};

type SelectFieldProps<T extends string> = {
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  options: SelectOption<T>[];
  placeholder?: string;
  required?: boolean;
  value: T;
  onValueChange: (value: T) => void;
};

function toRadixValue(value: string) {
  return value === "" ? EMPTY_VALUE : value;
}

function fromRadixValue(value: string) {
  return value === EMPTY_VALUE ? "" : value;
}

export function SelectField<T extends string>({
  id,
  ariaLabel,
  disabled,
  onValueChange,
  options,
  placeholder = "Select",
  required,
  value
}: SelectFieldProps<T>) {
  const hasEmptyOption = options.some((option) => option.value === "");
  const normalizedOptions = hasEmptyOption
    ? options
    : [{ disabled: true, label: placeholder, value: "" }, ...options];
  const radixValue = toRadixValue(value);

  return (
    <SelectPrimitive.Root
      disabled={disabled}
      required={required}
      value={radixValue}
      onValueChange={(nextValue) => {
        const option = options.find(
          (candidate) => candidate.value === fromRadixValue(nextValue)
        );
        if (option && !option.disabled) {
          onValueChange(option.value);
        }
      }}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className="ui-select-trigger"
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="ui-select-icon">
          <ChevronDown aria-hidden="true" size={16} strokeWidth={2.4} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="ui-select-content"
          position="popper"
          sideOffset={6}
        >
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {normalizedOptions.map((option) => (
              <SelectPrimitive.Item
                key={`${option.value}-${option.label}`}
                className="ui-select-item"
                disabled={option.disabled}
                value={toRadixValue(option.value)}
              >
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ui-select-indicator">
                  <Check aria-hidden="true" size={16} strokeWidth={2.6} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
