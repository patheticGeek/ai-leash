import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex w-full min-w-0 rounded-md outline-none transition-shadow duration-150 placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-[#141518] px-2 py-1.5 text-sm text-zinc-300 shadow-[var(--al-shadow)] focus:shadow-[0_0_0_1px_#3a5f8f]",
        chip: "w-auto bg-[#17181c] px-1 py-0.5 text-xs text-zinc-400 shadow-[var(--al-shadow)] focus:shadow-[0_0_0_1px_#3a5f8f]",
        unstyled: "bg-transparent text-sm text-zinc-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Input({
  className,
  type,
  variant,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(inputVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Input, inputVariants };
