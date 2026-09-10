import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { twMerge } from "tailwind-merge";

// Every clickable control in the app should render through this so cursor,
// disabled state, and hover feedback stay consistent — see the button audit
// this replaced (hand-rolled `<button className="...">` everywhere, several
// with no hover background and no `cursor-pointer`).
const buttonStyles = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg cursor-pointer select-none transition-all duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100",
  {
    variants: {
      variant: {
        primary:
          "bg-[#3a5f8f] text-white shadow-sm shadow-black/30 hover:bg-[#4a6f9f]",
        secondary:
          "shadow-[var(--al-shadow)] text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
        ghost: "text-zinc-500 hover:bg-white/10 hover:text-zinc-200",
        danger: "text-zinc-500 hover:bg-red-500/10 hover:text-red-400",
        // Escape hatch for buttons with bespoke layouts (menu rows, cards,
        // popover list items) that still need the shared cursor/disabled
        // behavior above but fully own their own color/spacing classes.
        unstyled: "",
      },
      size: {
        sm: "h-7 px-2.5 text-xs font-medium",
        md: "h-8 px-3 text-sm font-medium",
        icon: "h-7 w-7",
        "icon-sm": "h-6 w-6",
        none: "",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "sm",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      // twMerge (not plain concatenation) so a caller's className — e.g.
      // `block text-left` on an `unstyled` menu row — reliably overrides the
      // base's `inline-flex justify-center` for the same CSS property,
      // instead of leaving it to Tailwind's generated rule order.
      className={twMerge(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
});

export default Button;
