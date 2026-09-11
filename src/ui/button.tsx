import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap cursor-pointer transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        primary:
          "bg-[#3a5f8f] text-white shadow-sm shadow-black/30 hover:bg-[#4a6f9f]",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "shadow-[var(--al-shadow)] text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
        ghost: "text-zinc-500 hover:bg-white/10 hover:text-zinc-200",
        danger: "text-zinc-500 hover:bg-red-500/10 hover:text-red-400",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "text-primary underline-offset-4 hover:underline",
        // Escape hatch for buttons with bespoke layouts (menu rows, cards,
        // popover list items) that still need the shared cursor/disabled
        // behavior above but fully own their own color/spacing classes.
        unstyled: "",
      },
      size: {
        default: "h-8 gap-1.5 px-2.5 text-sm",
        md: "h-8 gap-1.5 px-3 text-sm",
        sm: "h-7 gap-1 px-2.5 text-xs",
        lg: "h-9 gap-1.5 px-2.5 text-sm",
        icon: "size-7 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-9",
        none: "h-auto w-auto p-0 gap-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "sm",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
