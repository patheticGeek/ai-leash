import { Badge } from "@astryxdesign/core/Badge";
import type { StatusDot } from "@astryxdesign/core/StatusDot";
import { Token } from "@astryxdesign/core/Token";
import {
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  Equal,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS } from "../../data/board";
import type { Epic, TaskPriority, TaskStatus } from "../../lib/tauriApi";

// The kanban-board template's own use of the priority Badge.
const PRIORITY_BADGE = {
  urgent: "error",
  high: "orange",
  medium: "warning",
  low: "teal",
} as const satisfies Record<
  TaskPriority,
  ComponentProps<typeof Badge>["variant"]
>;

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge
      label={PRIORITY_LABELS[priority]}
      variant={PRIORITY_BADGE[priority]}
    />
  );
}

// A column's StatusDot, as the kanban-board template colours them.
export const STATUS_DOT: Record<
  TaskStatus,
  ComponentProps<typeof StatusDot>["variant"]
> = {
  backlog: "neutral",
  todo: "neutral",
  in_progress: "accent",
  review: "warning",
  done: "success",
};

type TokenColor = NonNullable<ComponentProps<typeof Token>["color"]>;

// Epics store a hex colour from the palette Rust cycles through
// (`db/epics.rs`, `EpicsDialog`'s picker); a Token takes a palette name.
const EPIC_TOKEN_COLOR: Record<string, TokenColor> = {
  "#f97316": "orange",
  "#a855f7": "purple",
  "#22c55e": "green",
  "#3b82f6": "blue",
  "#ec4899": "pink",
  "#eab308": "yellow",
  "#14b8a6": "teal",
  "#ef4444": "red",
};

export function epicTokenColor(epic: Epic): TokenColor {
  return EPIC_TOKEN_COLOR[epic.color.toLowerCase()] ?? "gray";
}

export function EpicToken({
  epic,
  size = "sm",
}: {
  epic: Epic;
  size?: "sm" | "md";
}) {
  return (
    <Token
      size={size}
      label={epic.title}
      color={epicTokenColor(epic)}
      description={`Epic: ${epic.title}`}
    />
  );
}

// Still used by the task and epic dialogs (#37 migrates those).
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
