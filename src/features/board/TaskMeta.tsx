import {
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  Equal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS } from "../../data/board";
import type { Epic, TaskEffort, TaskPriority } from "../../lib/tauriApi";

const PRIORITY_STYLE: Record<
  TaskPriority,
  { icon: LucideIcon; className: string }
> = {
  urgent: { icon: ChevronsUp, className: "text-red-400" },
  high: { icon: ChevronUp, className: "text-orange-400" },
  medium: { icon: Equal, className: "text-zinc-400" },
  low: { icon: ChevronDown, className: "text-zinc-500" },
};

export function PriorityIcon({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const { icon: Icon, className: color } = PRIORITY_STYLE[priority];
  return (
    <span title={`${PRIORITY_LABELS[priority]} priority`}>
      <Icon className={cn("size-3.5", color, className)} />
    </span>
  );
}

export function EffortBadge({ effort }: { effort: TaskEffort }) {
  return (
    <span
      title={`Effort: ${effort.toUpperCase()}`}
      className="rounded bg-white/[0.06] px-1 text-[10px] font-medium uppercase leading-4 text-zinc-400"
    >
      {effort}
    </span>
  );
}

export function EpicDot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

export function EpicChip({ epic }: { epic: Epic }) {
  return (
    <span
      title={`Epic: ${epic.title}`}
      className="flex min-w-0 items-center gap-1 text-[11px] text-zinc-400"
    >
      <EpicDot color={epic.color} />
      <span className="truncate">{epic.title}</span>
    </span>
  );
}
