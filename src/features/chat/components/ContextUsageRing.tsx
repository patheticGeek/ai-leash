import { useState } from "react";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";

function formatTokenCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export interface ContextUsageRingProps {
  usedTokens: number;
  contextLength: number | null;
}

// The small conic-gradient ring next to the send button, showing how much
// of the active model's context window this conversation has used — hover
// (or focus, for keyboard use) to expand a small popover with the exact
// numbers. Only rendered by `ChatPanel.tsx` when there's a usage figure to
// show at all, so this component doesn't need its own "nothing to show" state.
export default function ContextUsageRing({
  usedTokens,
  contextLength,
}: ContextUsageRingProps) {
  const [open, setOpen] = useState(false);
  // `contextLength` truthy-checked (not `!== null`) to match the original
  // inline computation — a 0 (falsy) context length is treated the same as
  // "unknown" rather than dividing by zero.
  const usagePct = contextLength
    ? Math.min(100, (usedTokens / contextLength) * 100)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="unstyled"
          size="none"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{
              background:
                usagePct !== null
                  ? `conic-gradient(#3a5f8f ${usagePct}%, #26272c ${usagePct}% 100%)`
                  : "#26272c",
            }}
          >
            <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#17181c] text-[7px] text-zinc-400">
              {usagePct !== null ? Math.round(usagePct) : "–"}
            </div>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={8} className="w-48">
        <div className="flex items-center justify-between text-[10px] text-zinc-400">
          <span>Context usage</span>
          <span className="font-medium text-zinc-200">
            {usagePct !== null ? `${usagePct.toFixed(0)}%` : "–"}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1c1d21]">
          <div
            className="h-full bg-[#3a5f8f]"
            style={{ width: `${usagePct ?? 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-zinc-600">
          <span>{formatTokenCount(usedTokens)} used</span>
          <span>
            {contextLength ? formatTokenCount(contextLength) : "?"} total
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
