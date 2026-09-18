import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { messagesToEntries } from "../../lib/chatEntries";
import { api } from "../../lib/tauriApi";
import { useAppStore } from "../../store";
import { Badge } from "../../ui/badge";
import ChatEntryList from "./components/ChatEntryList";

const statusStyles: Record<string, string> = {
  running:
    "text-amber-400 shadow-[0_0_0_1px_rgba(120,53,15,0.5)] bg-amber-950/20",
  done: "text-emerald-400 shadow-[0_0_0_1px_rgba(6,78,59,0.5)] bg-emerald-950/20",
  error: "text-red-400 shadow-[0_0_0_1px_rgba(127,29,29,0.5)] bg-red-950/20",
};

// Shows a sub-agent's own transcript through the same `ChatEntryList`/
// `ChatEntryRenderer` a top-level conversation uses — tool calls and
// thinking blocks render identically (collapsible, same icons/labels), just
// with `allowRetry`/the top-level-only banners turned off, since a
// sub-agent has no `retry_last`/system-prompt/Ollama-error/ACP-restore
// concept of its own.
export default function SubAgentChatTab({
  subSessionId,
}: {
  subSessionId: string;
}) {
  const rawEntries = useAppStore((s) => s.subAgentThreads[subSessionId]);
  const setSubAgentEntries = useAppStore((s) => s.setSubAgentEntries);
  const entries = rawEntries ?? [];
  const task = useAppStore((s) =>
    s.subAgentTasks.find((t) => t.subSessionId === subSessionId),
  );

  // Reopening this tab after an app restart (or after a live event listener
  // never populated it, e.g. it started before this tab was ever mounted)
  // has nothing in the store yet — fetch its transcript from disk. Distinct
  // from "loaded, empty" (`rawEntries` is `[]`, not `undefined`) so this
  // only ever fetches once.
  useEffect(() => {
    if (rawEntries !== undefined) return;
    api.loadConversationHistory(subSessionId).then((messages) => {
      setSubAgentEntries(subSessionId, (prev) =>
        prev.length === 0 ? messagesToEntries(messages) : prev,
      );
    });
  }, [subSessionId, rawEntries, setSubAgentEntries]);

  const running = task?.status === "running";

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <Badge
          className={cn(
            "h-auto shrink-0 rounded-md px-1.5 py-0.5 uppercase tracking-wide",
            statusStyles[task?.status ?? "done"],
          )}
        >
          {task?.status === "running" ? "running…" : (task?.status ?? "done")}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-zinc-300">
          {task?.description}
        </span>
        {task?.model && (
          <span className="shrink-0 truncate text-zinc-600">
            {task.model}
            {task.effort ? ` (${task.effort})` : ""}
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="text-sm text-zinc-600">
            Waiting for sub-agent output…
          </div>
        </div>
      ) : (
        <div className="relative flex-1 overflow-hidden">
          <ChatEntryList
            entries={entries}
            sending={running}
            isAcp={false}
            allowRetry={false}
            turnDurations={{}}
            replyStartedAt={task?.startedAt ?? null}
          />
        </div>
      )}
    </div>
  );
}
