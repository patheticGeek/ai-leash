import { Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSubAgents } from "@/data/subAgents";
import { formatDuration, formatTime } from "@/lib/format";
import { Button, revealOnGroupHover } from "@/ui/button";
import { Card } from "@/ui/card";
import { api } from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";
import SubAgentStatusBadge from "../../chat/SubAgentStatusBadge";

export default function SubAgentsTab() {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const tasks = useSubAgents(activeSessionId);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const deleteSubAgentTask = useAppStore((s) => s.deleteSubAgentTask);

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
          No sub-agents running in this conversation. The main agent spawns
          these via the{" "}
          <code className="mx-1 text-code text-zinc-500">spawn_sub_agent</code>{" "}
          tool.
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
          ((running ? now : (task.endedAt ?? now)) - task.startedAt) / 1000,
        );
        return (
          <Card
            key={task.subSessionId}
            interactive
            className="group flex-row items-stretch gap-0 rounded-md py-0 text-xs"
          >
            <Button
              variant="unstyled"
              size="none"
              onClick={() => openChatTab(task.subSessionId, task.description)}
              className="min-w-0 flex-1 flex-col items-start px-2.5 py-2 text-left"
            >
              <div className="flex w-full items-center gap-2">
                <SubAgentStatusBadge status={task.status} />
                <span className="min-w-0 flex-1 truncate text-zinc-300">
                  {task.description}
                </span>
              </div>
              <div className="mt-1 w-full truncate text-[10px] text-zinc-600">
                started {formatTime(task.startedAt)} ·{" "}
                {running ? "running" : "ran"} for {duration} · {task.model}
                {task.effort ? ` (${task.effort})` : ""}
              </div>
            </Button>
            <div className="flex shrink-0 items-center pr-2">
              {running ? (
                <Button
                  variant="danger"
                  size="icon-sm"
                  title="Stop sub-agent"
                  onClick={() => void api.cancelPrompt(task.subSessionId)}
                  className={revealOnGroupHover}
                >
                  <Square size={12} />
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="icon-sm"
                  title="Delete sub-agent"
                  onClick={() =>
                    activeSessionId &&
                    deleteSubAgentTask(activeSessionId, task.subSessionId)
                  }
                  className={revealOnGroupHover}
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
