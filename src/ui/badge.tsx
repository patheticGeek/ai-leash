import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border border-transparent font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        muted: "bg-zinc-900/40 text-zinc-500",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        danger: "bg-destructive/10 text-destructive",
      },
      // A 1px border in the variant's own colour — for pills that sit on a
      // surface of their own (cards, the title bar) instead of floating.
      outline: {
        true: "",
        false: "",
      },
      size: {
        default: "h-5 rounded-4xl px-2 py-0.5 text-xs",
        // Status pill (running / done / error) — square-ish, all caps.
        sm: "h-auto rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
        // Numeric bubble pinned to a tab or tile.
        count: "h-5 min-w-5 rounded-full px-1 text-[10px]",
      },
    },
    compoundVariants: [
      { variant: "default", outline: true, class: "border-primary-hover" },
      { variant: "secondary", outline: true, class: "border-border" },
      { variant: "muted", outline: true, class: "border-border" },
      { variant: "success", outline: true, class: "border-success/30" },
      { variant: "warning", outline: true, class: "border-warning/30" },
      { variant: "danger", outline: true, class: "border-destructive/30" },
    ],
    defaultVariants: {
      variant: "default",
      outline: false,
      size: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  outline = false,
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(badgeVariants({ variant, outline, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
