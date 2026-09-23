import { Slot } from "@radix-ui/react-slot";
import { Trash2 } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";

import { classes } from "../../lib/classes";
import { Tooltip } from "./tooltip";

type ButtonVariant =
  "primary" | "secondary" | "danger" | "ghost" | "nav" | "settings";

type ButtonSize = "sm" | "md" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  selected?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild = false,
      className,
      size = "md",
      selected = false,
      variant = "primary",
      ...props
    },
    ref
  ) => {
    const Component = asChild ? Slot : "button";

    return (
      <Component
        ref={ref}
        className={classes([
          "ui-button",
          `ui-button--${variant}`,
          `ui-button--${size}`,
          selected && "is-selected",
          className
        ])}
        data-selected={selected ? "true" : undefined}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

type DeleteButtonProps = Omit<ButtonProps, "children" | "variant">;

export const DeleteButton = forwardRef<HTMLButtonElement, DeleteButtonProps>(
  (props, ref) => (
    <Button ref={ref} variant="danger" {...props}>
      <Trash2 aria-hidden="true" size={16} strokeWidth={2.5} />
      Delete
    </Button>
  )
);

DeleteButton.displayName = "DeleteButton";

type IconButtonProps = Omit<ButtonProps, "children" | "size"> & {
  children: ReactNode;
  label: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ children, label, title, ...props }, ref) => {
    const content = (
      <Button
        ref={ref}
        aria-label={label}
        title={title ?? label}
        size="icon"
        {...props}
      >
        {children}
      </Button>
    );

    return <Tooltip content={title ?? label}>{content}</Tooltip>;
  }
);

IconButton.displayName = "IconButton";
