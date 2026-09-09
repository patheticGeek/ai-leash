import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useAppStore } from "../store";
import Button from "./Button";

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const statusStyles: Record<string, string> = {
  running: "text-amber-400 border-amber-900/50 bg-amber-950/20",
  done: "text-emerald-400 border-emerald-900/50 bg-emerald-950/20",
  error: "text-red-400 border-red-900/50 bg-red-950/20",
};

export default function SubAgentsTab() {
  const tasks = useAppStore((s) => s.subAgentTasks);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const loadSubAgentTasks = useAppStore((s) => s.loadSubAgentTasks);
  const deleteSubAgentTask = useAppStore((s) => s.deleteSubAgentTask);

  useEffect(() => {
    loadSubAgentTasks();
  }, [loadSubAgentTasks]);

  // Ticks once a second so a running task's "running for" duration keeps
  // advancing — only while something is actually running, since otherwise
  // every finished duration is fixed and nothing needs to re-render.
  const hasRunning = tasks.some((t) => t.status === "running");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  if (tasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="text-center text-sm text-zinc-600">
          No sub-agents running. The main agent spawns these via the{" "}
          <code className="mx-1 text-zinc-500">spawn_sub_agent</code> tool.
        </div>
      </div>
    );
  }

  const sorted = [...tasks].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-2 gap-2">
      {sorted.map((task) => {
        const running = task.status === "running";
        const duration = formatDuration((running ? now : (task.endedAt ?? now)) - task.startedAt);
        return (
          <div
            key={task.subSessionId}
            onClick={() => openChatTab(task.subSessionId, task.description)}
            className="group cursor-default rounded border border-[#26272c] bg-[#141518] px-2.5 py-1.5 text-xs hover:border-[#3a5f8f]"
          >
            <div className="flex items-center gap-2">
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusStyles[task.status]}`}
              >
                {task.status === "running" ? "running…" : task.status}
              </span>
              <span className="min-w-0 flex-1 truncate text-zinc-300">{task.description}</span>
              {!running && (
                <Button
                  variant="danger"
                  size="icon-sm"
                  title="Delete sub-agent"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSubAgentTask(task.subSessionId);
                  }}
                  className="shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </div>
            <div className="mt-1 text-[10px] text-zinc-600">
              started {formatTime(task.startedAt)} · {running ? "running" : "ran"} for {duration}
            </div>
          </div>
        );
      })}
    </div>
  );
}
