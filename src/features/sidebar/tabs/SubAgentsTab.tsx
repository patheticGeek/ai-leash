import { Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { api } from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";

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
  running:
    "text-amber-400 shadow-[0_0_0_1px_rgba(120,53,15,0.5)] bg-amber-950/20",
  done: "text-emerald-400 shadow-[0_0_0_1px_rgba(6,78,59,0.5)] bg-emerald-950/20",
  error: "text-red-400 shadow-[0_0_0_1px_rgba(127,29,29,0.5)] bg-red-950/20",
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
        const duration = formatDuration(
          (running ? now : (task.endedAt ?? now)) - task.startedAt,
        );
        return (
          <Card
            key={task.subSessionId}
            className="group cursor-default gap-0 rounded-md px-2.5 py-1.5 text-xs shadow-[var(--al-shadow)] transition-shadow duration-150 hover:shadow-[0_0_0_1px_#3a5f8f]"
          >
            <div className="flex items-center gap-2">
              <Button
                variant="unstyled"
                size="none"
                onClick={() => openChatTab(task.subSessionId, task.description)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Badge
                  className={`h-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusStyles[task.status]}`}
                >
                  {task.status === "running" ? "running…" : task.status}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-zinc-300">
                  {task.description}
                </span>
              </Button>
              {running ? (
                <Button
                  variant="danger"
                  size="icon-sm"
                  title="Stop sub-agent"
                  onClick={() => void api.cancelPrompt(task.subSessionId)}
                  className="shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <Square size={12} />
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="icon-sm"
                  title="Delete sub-agent"
                  onClick={() => deleteSubAgentTask(task.subSessionId)}
                  className="shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </div>
            <div className="mt-1 text-[10px] text-zinc-600">
              started {formatTime(task.startedAt)} ·{" "}
              {running ? "running" : "ran"} for {duration}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
