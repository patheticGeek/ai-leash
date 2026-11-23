import { Button } from "@astryxdesign/core/Button";
import { ChevronRight } from "lucide-react";
import type * as React from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

interface ActivityRowProps {
  /** Leading icon (tool, agent, …). Turns red when `status="failed"`. */
  icon?: React.ReactNode;
  label: React.ReactNode;
  /** Dim one-line preview shown after the label while collapsed. */
  summary?: React.ReactNode;
  status?: "running" | "failed";
  italic?: boolean;
  /** Animated shimmer on the label, for something still in progress. */
  shine?: boolean;
  expanded?: boolean;
  /** Omit for a static marker with no chevron and no detail. */
  onToggle?: () => void;
  /** Detail shown under the header while `expanded`. */
  children?: React.ReactNode;
  className?: string;
}

// A single line in a transcript that stands for something the agent did or
// is doing (thinking, a tool call, a sub-agent, the system prompt) — a
// chevron + label header that expands to show its detail beside a thin rule.
// Feature-level, not in `src/ui`: the registry's own `marker` is a static
// divider, not an expandable row. Not Astryx's `Collapsible` either: its
// trigger is a large semibold section header, and it keeps closed content
// mounted, where a transcript row is one line of small text and a closed
// row's detail (tool output, diffs) shouldn't stay in the DOM. So the
// disclosure is wired here: aria-expanded / aria-controls on the header, and
// the detail rendered only while open. Stays controlled (`expanded` /
// `onToggle`) because the transcript owns which rows are open.
function ActivityRow({
  icon,
  label,
  summary,
  status,
  italic,
  shine,
  expanded = false,
  onToggle,
  children,
  className,
}: ActivityRowProps) {
  const detailId = useId();
  const failed = status === "failed";
  const expandable = onToggle !== undefined;
  const header = (
    <>
      {expandable && (
        <ChevronRight
          size={12}
          className={cn(
            "shrink-0 text-current transition-transform duration-200 ease-out",
            expanded && "rotate-90",
          )}
        />
      )}
      {icon && (
        <span
          className={cn(
            "inline-flex shrink-0 [&_svg]:size-3",
            failed && "text-red-400",
          )}
        >
          {icon}
        </span>
      )}
      <span
        className={cn(
          "truncate",
          "shrink-0 max-w-4/5",
          italic && "italic",
          shine && "shine-text",
          failed && "text-red-400",
        )}
      >
        {label}
      </span>
      {summary && !expanded && (
        <span className="select-text min-w-0 flex-1 truncate text-zinc-600">
          {summary}
        </span>
      )}
      {status === "running" && (
        <span className="shrink-0 text-zinc-600">running…</span>
      )}
      {failed && <span className="shrink-0 text-red-400">failed</span>}
    </>
  );

  return (
    <div data-slot="activity-row" className={cn("text-xs", className)}>
      {expandable ? (
        <Button
          variant="ghost"
          size="sm"
          label={typeof label === "string" ? label : "Show details"}
          aria-expanded={expanded}
          aria-controls={expanded && children ? detailId : undefined}
          onClick={onToggle}
          width="100%"
          // No left padding, so the chevron lines up with the start of
          // the transcript's text.
          className="h-auto justify-start py-0.5 pl-0 text-xs"
        >
          <span className="flex w-full min-w-0 items-center gap-1.5 text-left">
            {header}
          </span>
        </Button>
      ) : (
        <div className="inline-flex items-center gap-1.5 py-0.5 pr-1 text-zinc-600">
          {header}
        </div>
      )}
      {expandable && expanded && children && (
        <div id={detailId} className="relative mt-1 pl-5 text-zinc-600">
          {/* The rule doubles as a collapse control. Its hit area is as
              wide as the chevron (12px) so the 2px line sits under the
              chevron's center. */}
          <button
            type="button"
            aria-label="Collapse"
            onClick={onToggle}
            className="group/rule absolute inset-y-0 left-0 flex w-4.5 cursor-pointer justify-center"
          >
            <span className="w-0.5 bg-border transition-colors duration-200 ease-out group-hover/rule:bg-zinc-500" />
          </button>
          <div className="space-y-2">{children}</div>
        </div>
      )}
    </div>
  );
}

export { ActivityRow };
