import { Badge } from "@astryxdesign/core/Badge";
import type { StatusDot } from "@astryxdesign/core/StatusDot";
import { Token } from "@astryxdesign/core/Token";
import type { ComponentProps } from "react";
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

// Epics store a hex colour from the palette Rust cycles through for new
// ones (`db/epics.rs`) — the same order `EpicsDialog` offers them in; a
// Token takes a palette name.
export const EPIC_COLORS: { hex: string; token: TokenColor; name: string }[] = [
  { hex: "#f97316", token: "orange", name: "Orange" },
  { hex: "#a855f7", token: "purple", name: "Purple" },
  { hex: "#22c55e", token: "green", name: "Green" },
  { hex: "#3b82f6", token: "blue", name: "Blue" },
  { hex: "#ec4899", token: "pink", name: "Pink" },
  { hex: "#eab308", token: "yellow", name: "Yellow" },
  { hex: "#14b8a6", token: "teal", name: "Teal" },
  { hex: "#ef4444", token: "red", name: "Red" },
];

export function hexTokenColor(hex: string): TokenColor {
  const lower = hex.toLowerCase();
  return EPIC_COLORS.find((c) => c.hex === lower)?.token ?? "gray";
}

export function epicTokenColor(epic: Epic): TokenColor {
  return hexTokenColor(epic.color);
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
