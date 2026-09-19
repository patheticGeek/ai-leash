import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The tiny uppercase caption above a block inside an expanded transcript row
// ("input", "output", a sub-agent's task, …).
export default function SectionLabel({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "error";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[9px] uppercase tracking-wide",
        tone === "error" ? "text-red-400" : "text-zinc-700",
        className,
      )}
    >
      {children}
    </div>
  );
}
