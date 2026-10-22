import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Loader, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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
}: {
  task: Task;
  epic: Epic | undefined;
  dragging?: boolean;
}) {
  const { active: generating, startedAtMs } = useGenerating(
    task.conversationId ?? "",
  );
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md bg-raised px-3 py-2.5 text-left text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition-shadow hover:shadow-[0_0_0_1px_var(--primary)]",
        dragging && "cursor-grabbing shadow-[0_0_0_1px_var(--primary)]",
        task.status === "done" && "opacity-60",
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 break-words text-zinc-200">
          {task.title}
        </span>
        {generating ? (
          <span
            title="Working"
            className="flex shrink-0 items-center gap-1 text-xs text-blue-400"
          >
            {startedAtMs != null && <Elapsed startedAtMs={startedAtMs} />}
            <Loader size={12} className="animate-spin" />
          </span>
        ) : (
          task.conversationId && (
            <span title="Has a chat" className="shrink-0 text-zinc-500">
              <MessageSquare size={12} />
            </span>
          )
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="tabular-nums">#{task.number}</span>
        <PriorityIcon priority={task.priority} />
        {task.effort && <EffortBadge effort={task.effort} />}
        {epic && <EpicChip epic={epic} />}
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
}: {
  task: Task;
  epic: Epic | undefined;
  lane: string;
  onOpen: () => void;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", lane, status: task.status },
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "block w-full cursor-pointer touch-none text-left outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/50",
        isDragging && "opacity-30",
      )}
      {...attributes}
      {...listeners}
      onClick={onOpen}
    >
      <TaskCardBody task={task} epic={epic} />
    </button>
  );
}
