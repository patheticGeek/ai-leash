import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Loader, MessageSquare, Play } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, revealOnGroupHover } from "@/ui/button";
import { formatDuration } from "../../lib/format";
import { useGenerating } from "../../lib/generatingQuery";
import type { Epic, Task } from "../../lib/tauriApi";
import { EffortBadge, EpicChip, PriorityIcon } from "./TaskMeta";

// Ticks once a second while the task's chat has a turn running.
function Elapsed({ startedAtMs }: { startedAtMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="tabular-nums">
      {formatDuration((now - startedAtMs) / 1000)}
    </span>
  );
}

// What a card shows, without any drag behaviour — also the drag overlay.
export function TaskCardBody({
  task,
  epic,
  dragging = false,
  actions,
}: {
  task: Task;
  epic: Epic | undefined;
  dragging?: boolean;
  // Buttons at the end of the card's bottom row.
  actions?: ReactNode;
}) {
  const { active: generating, startedAtMs } = useGenerating(
    task.conversationId ?? "",
  );
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md bg-raised px-3 py-2.5 text-left text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition-shadow group-hover:shadow-[0_0_0_1px_var(--primary)]",
        dragging && "cursor-grabbing shadow-[0_0_0_1px_var(--primary)]",
        task.status === "done" && "opacity-60",
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 break-words text-zinc-200">
          {task.title}
        </span>
        {generating && (
          <span
            title="Working"
            className="flex shrink-0 items-center gap-1 text-xs text-blue-400"
          >
            {startedAtMs != null && <Elapsed startedAtMs={startedAtMs} />}
            <Loader size={12} className="animate-spin" />
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="tabular-nums">#{task.number}</span>
        <PriorityIcon priority={task.priority} />
        {task.effort && <EffortBadge effort={task.effort} />}
        {epic && <EpicChip epic={epic} />}
        {actions && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            {actions}
          </span>
        )}
      </div>
    </div>
  );
}

// A draggable card. `lane` is the swimlane it sits in (an epic id, "none",
// or "all" when the board isn't grouped) — dropping it in another lane
// changes its epic.
export default function TaskCard({
  task,
  epic,
  lane,
  onOpen,
  onStart,
  onOpenChat,
}: {
  task: Task;
  epic: Epic | undefined;
  lane: string;
  onOpen: () => void;
  onStart: () => void;
  onOpenChat: () => void;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "task", lane, status: task.status },
    });
  const startable = !task.conversationId && task.status !== "done";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group relative touch-none", isDragging && "opacity-30")}
      {...listeners}
    >
      <TaskCardBody
        task={task}
        epic={epic}
        actions={
          <>
            {startable && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Start: give it a chat (and worktree) and get going"
                onClick={onStart}
                className={cn("relative z-10", revealOnGroupHover)}
              >
                <Play />
              </Button>
            )}
            {task.conversationId && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Open its chat"
                onClick={onOpenChat}
                className="relative z-10"
              >
                <MessageSquare />
              </Button>
            )}
          </>
        }
      />
      {/* Covers the whole card under the action buttons, so the card itself
          is one button for keyboard and screen readers. */}
      <button
        type="button"
        onClick={onOpen}
        title={`Edit #${task.number}`}
        className="absolute inset-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    </div>
  );
}
