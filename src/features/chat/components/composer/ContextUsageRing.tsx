import { HoverCard } from "@astryxdesign/core/HoverCard";
import { IconButton } from "@astryxdesign/core/IconButton";
import * as stylex from "@stylexjs/stylex";
import { formatTokenCount } from "@/lib/format";

const styles = stylex.create({
  card: { width: "12rem" },
});

export interface ContextUsageRingProps {
  usedTokens: number;
  contextLength: number | null;
}

// The small conic-gradient ring next to the send button, showing how much
// of the active model's context window this conversation has used — hover
// (or focus, for keyboard use) to expand a small popover with the exact
// numbers (a HoverCard, so hover and focus both open it). Only rendered by `ChatPanel.tsx` when there's a usage figure to
// show at all, so this component doesn't need its own "nothing to show" state.
export default function ContextUsageRing({
  usedTokens,
  contextLength,
}: ContextUsageRingProps) {
  // `contextLength` truthy-checked (not `!== null`) to match the original
  // inline computation — a 0 (falsy) context length is treated the same as
  // "unknown" rather than dividing by zero.
  const usagePct = contextLength
    ? Math.min(100, (usedTokens / contextLength) * 100)
    : null;

  return (
    <HoverCard
      label="Context usage"
      placement="above"
      alignment="end"
      focusTrigger="always"
      delay={0}
      hideDelay={0}
      xstyle={styles.card}
      content={
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span>Context usage</span>
            <span className="font-medium text-zinc-200">
              {usagePct !== null ? `${usagePct.toFixed(0)}%` : "–"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
            <div
              className="h-full bg-primary"
              style={{ width: `${usagePct ?? 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-600">
            <span>{formatTokenCount(usedTokens)} used</span>
            <span>
              {contextLength ? formatTokenCount(contextLength) : "?"} total
            </span>
          </div>
        </div>
      }
    >
      <IconButton
        variant="ghost"
        size="sm"
        label="Context usage"
        icon={
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{
              background:
                usagePct !== null
                  ? `conic-gradient(var(--primary) ${usagePct}%, var(--border) ${usagePct}% 100%)`
                  : "var(--border)",
            }}
          >
            <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-raised text-[7px] text-muted-foreground">
              {usagePct !== null ? Math.round(usagePct) : "–"}
            </div>
          </div>
        }
      />
    </HoverCard>
  );
}
