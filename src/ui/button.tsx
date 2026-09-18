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
          "bg-primary text-primary-foreground shadow-sm shadow-black/30 hover:bg-primary-hover",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "shadow-[var(--al-shadow)] text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
        ghost: "text-zinc-500 hover:bg-white/10 hover:text-zinc-200",
        // Dimmer than `ghost` and brightens on hover without a hover
        // background — for secondary icon actions (copy, retry, close tab,
        // clear) that shouldn't compete with the primary controls around
        // them.
        quiet: "text-zinc-600 hover:text-zinc-300",
        danger: "text-zinc-500 hover:bg-red-500/10 hover:text-red-400",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        link: "text-primary underline-offset-4 hover:underline",
        // Popover/dropdown trigger pill — icon + label chip sitting in a
        // toolbar (model picker, effort picker, permission mode).
        chip: "rounded-md bg-white/[0.04] px-1.5 py-1 text-xs text-zinc-400 outline-none hover:bg-white/5 hover:text-zinc-200",
        // Same chip shape, tinted for a state the chip is currently *in*
        // rather than a neutral trigger — pick one per call site with a
        // ternary (see `ChatInputBar`'s send/stop, `PermissionModePopover`'s
        // ask/bypass). Colors come from the matching semantic token so they
        // stay in sync with the rest of the app's danger/warning/brand use.
        "chip-primary":
          "rounded-md px-2 py-1 text-xs outline-none bg-primary/15 text-primary-hover hover:bg-primary/25 disabled:hover:bg-primary/15",
        "chip-danger":
          "rounded-md px-2 py-1 text-xs outline-none bg-destructive/10 text-destructive hover:bg-destructive/20",
        "chip-warning":
          "rounded-md px-1.5 py-1 text-xs outline-none bg-warning/10 text-warning hover:bg-warning/20",
        // Row inside a popover/dropdown list (model picker, effort picker,
        // slash command menu). Pass `data-active` to mark the selected row.
        "menu-item":
          "block w-full px-3 py-2 text-left hover:bg-white/5 data-[active=true]:bg-white/10 data-[active=true]:hover:bg-white/10",
        // Selectable card tile (agent type picker, tab picker) — a small
        // block of content rather than a single label, so it gets its own
        // padding/column layout instead of the horizontal chip/menu shapes.
        card: "flex min-w-0 flex-col items-start gap-1.5 rounded-md bg-card px-3 py-2.5 text-left shadow-[var(--al-shadow)] hover:shadow-[0_0_0_1px_var(--primary)] hover:bg-white/5",
        // Escape hatch for buttons with bespoke layouts (menu rows, cards,
        // popover list items) that still need the shared cursor/disabled
        // behavior above but fully own their own color/spacing classes.
        unstyled: "",
      },
      size: {
        md: "h-8 gap-1.5 px-3 text-sm",
        sm: "h-7 gap-1 px-2.5 text-xs",
        // Inline row action (copy/retry/expand toggles under a chat
        // message) — content-sized rather than a fixed height, tighter
        // padding than `none` bothers to specify on its own.
        xs: "h-auto gap-1.5 px-1 py-0.5 text-xs",
        icon: "size-7 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-9",
        // Only `gap-0`: cva appends `size` classes after `variant` ones, so
        // any width/height/padding utility here would beat (via
        // tailwind-merge's last-write-wins) the same property baked into a
        // variant (menu-item's `w-full`, chip/card padding). Buttons are
        // already `w-auto`/`h-auto`/unpadded by default (preflight), so those
        // were no-ops for unstyled buttons anyway.
        none: "gap-0",
      },
      // Only meaningful on the chip variants (see compoundVariants) — a 1px
      // ring around the chip. Button resolves the default per variant: the
      // tinted chip-* variants are bordered unless told otherwise, the
      // neutral `chip` isn't.
      bordered: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      // Kept out of the base `chip` string: tailwind-merge doesn't treat a
      // var()-based shadow as conflicting with the ring shadow below, so
      // both would otherwise be emitted.
      {
        variant: "chip",
        bordered: false,
        class: "shadow-[var(--al-shadow)]",
      },
      {
        variant: "chip",
        bordered: true,
        class:
          "bg-zinc-800/60 text-zinc-300 shadow-[0_0_0_1px_rgba(82,82,91,0.6)] hover:bg-zinc-800 hover:text-zinc-100",
      },
      {
        variant: "chip-primary",
        bordered: true,
        class: "shadow-[0_0_0_1px_var(--primary)]",
      },
      {
        variant: "chip-danger",
        bordered: true,
        class: "shadow-[0_0_0_1px_var(--destructive)]",
      },
      {
        variant: "chip-warning",
        bordered: true,
        class: "shadow-[0_0_0_1px_var(--warning)]",
      },
    ],
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

function Button({
  className,
  variant,
  size,
  bordered,
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
      className={cn(
        buttonVariants({
          variant,
          size,
          bordered: bordered ?? variant !== "chip",
          className,
        }),
      )}
      {...props}
    />
  );
}

// Shared by icon buttons that only appear on hover of their nearest
// ancestor `.group` (row actions like delete/edit). Needs a *named* group
// (`group-hover/name:`) instead? Compose your own className — this only
// covers the common unnamed-group case.
const revealOnGroupHover = "shrink-0 opacity-0 group-hover:opacity-100";

export { Button, buttonVariants, revealOnGroupHover };
