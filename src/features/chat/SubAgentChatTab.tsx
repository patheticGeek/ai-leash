import { useEffect } from "react";
import {
  messagesToEntries,
  reconcileWithPersisted,
} from "../../lib/chatEntries";
import { api } from "../../lib/tauriApi";
import { useAppStore } from "../../store";
import ChatEntryList from "./components/messages/ChatEntryList";
import SubAgentStatusBadge from "./SubAgentStatusBadge";

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
  const entries = useAppStore((s) => s.subAgentThreads[subSessionId]) ?? [];
  const setSubAgentEntries = useAppStore((s) => s.setSubAgentEntries);
  const task = useAppStore((s) =>
    s.subAgentTasks.find((t) => t.subSessionId === subSessionId),
  );

  // The persisted transcript is the source of truth for what a sub-agent was
  // asked to do (its opening user message is written by the backend before
  // it runs, and never streamed as an event), so always reconcile with it on
  // mount rather than only when nothing else has populated the store yet —
  // a live thread built purely from stream events would otherwise lack it,
  // and a tab reopened after an app restart has nothing else to show at all.
  useEffect(() => {
    let cancelled = false;
    api.loadConversationHistory(subSessionId).then((messages) => {
      if (cancelled) return;
      setSubAgentEntries(subSessionId, (prev) =>
        reconcileWithPersisted(prev, messagesToEntries(messages)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [subSessionId, setSubAgentEntries]);

  const running = task?.status === "running";
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <SubAgentStatusBadge status={task?.status ?? "done"} />
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
