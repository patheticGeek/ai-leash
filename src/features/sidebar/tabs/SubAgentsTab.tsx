import { List, ListItem } from "@astryxdesign/core/List";
import { Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSubAgents } from "@/data/subAgents";
import { formatDuration, formatTime } from "@/lib/format";
import { Button, revealOnGroupHover } from "@/ui/button";
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
    <div className="flex h-full flex-col overflow-y-auto p-2">
      <List density="compact" hasDividers>
        {sorted.map((task) => {
          const running = task.status === "running";
          const duration = formatDuration(
            ((running ? now : (task.endedAt ?? now)) - task.startedAt) / 1000,
          );
          return (
            <ListItem
              key={task.subSessionId}
              // `group` drives the hover-revealed Stop/Delete button.
              className="group"
              onClick={() => openChatTab(task.subSessionId, task.description)}
              startContent={<SubAgentStatusBadge status={task.status} />}
              label={task.description}
              description={`started ${formatTime(task.startedAt)} · ${running ? "running" : "ran"} for ${duration} · ${task.model}${task.effort ? ` (${task.effort})` : ""}`}
              endContent={
                running ? (
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
                )
              }
            />
          );
        })}
      </List>
    </div>
  );
}
