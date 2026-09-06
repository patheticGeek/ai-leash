import { useEffect } from "react";
import { useAppStore, SUB_AGENT_MAX_AGE_MS } from "../store";

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const statusStyles: Record<string, string> = {
  running: "text-amber-400 border-amber-900/50 bg-amber-950/20",
  done: "text-emerald-400 border-emerald-900/50 bg-emerald-950/20",
  error: "text-red-400 border-red-900/50 bg-red-950/20",
};

// How often to re-check for expired entries while this tab just sits open
// with nothing new happening — the age cap itself is a full day, so this
// doesn't need to be tight.
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

export default function SubAgentsTab() {
  const allTasks = useAppStore((s) => s.subAgentTasks);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const pruneOldSubAgentTasks = useAppStore((s) => s.pruneOldSubAgentTasks);

  useEffect(() => {
    pruneOldSubAgentTasks();
    const interval = setInterval(pruneOldSubAgentTasks, PRUNE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pruneOldSubAgentTasks]);

  // Defensive on top of the store's own pruning (on insert + this interval)
  // so nothing older than the cap is ever shown even for the moment
  // between prunes.
  const cutoff = Date.now() - SUB_AGENT_MAX_AGE_MS;
  const tasks = allTasks.filter((t) => t.startedAt >= cutoff);

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
      {sorted.map((task) => (
        <div
          key={task.subSessionId}
          onClick={() => openChatTab(task.subSessionId, task.description)}
          className="cursor-default rounded border border-[#26272c] bg-[#141518] px-2.5 py-1.5 text-xs hover:border-[#3a5f8f]"
        >
          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusStyles[task.status]}`}
            >
              {task.status === "running" ? "running…" : task.status}
            </span>
            <span className="min-w-0 flex-1 truncate text-zinc-300">{task.description}</span>
          </div>
          <div className="mt-1 text-[10px] text-zinc-600">
            started {formatTime(task.startedAt)}
          </div>
        </div>
      ))}
    </div>
  );
}
