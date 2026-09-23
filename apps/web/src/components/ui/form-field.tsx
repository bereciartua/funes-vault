import type { LabelHTMLAttributes, ReactNode } from "react";
export function FormField({
  label,
  hint,
  required,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
}) {
  return (
    <label {...props}>
      <span>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
