// Adapted from the shadcn registry `alert` (radix-nova). Changes for this
// app: a single flex row (message on the left, actions on the right) instead
// of the registry's icon/title/description grid — our banners are a line of
// text with buttons, so `AlertTitle` and the absolutely-positioned action are
// dropped; variants follow `Badge` (default / info / warning / danger) with
// the same `outline` switch, drawn as a 1px ring; no `dark:` variants.

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "group/alert flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-xs",
  {
    variants: {
      variant: {
        default: "bg-card text-zinc-400",
        info: "bg-alert-info text-blue-300",
        warning: "bg-alert-warning text-amber-300",
        danger: "bg-alert-danger text-red-300",
      },
      // A 1px ring in the variant's own colour — for banners that sit inside
      // the content (a transcript) rather than docked against something.
      outline: {
        true: "ring-1",
        false: "",
      },
    },
    compoundVariants: [
      { variant: "default", outline: true, class: "ring-border" },
      { variant: "info", outline: true, class: "ring-blue-900/50" },
      { variant: "warning", outline: true, class: "ring-amber-900/50" },
      { variant: "danger", outline: true, class: "ring-red-900/50" },
    ],
    defaultVariants: {
      variant: "default",
      outline: false,
    },
  },
);

function Alert({
  className,
  variant = "default",
  outline = false,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role="alert"
      className={cn(alertVariants({ variant, outline }), className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("min-w-0 flex-1", className)}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("flex shrink-0 items-center gap-2", className)}
      {...props}
    />
  );
}

export { Alert, AlertAction, AlertDescription, alertVariants };
