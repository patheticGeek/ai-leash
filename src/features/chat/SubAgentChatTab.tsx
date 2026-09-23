import { useEffect } from "react";
import { useSubAgents } from "../../data/subAgents";
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
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const task = useSubAgents(activeSessionId).find(
    (t) => t.subSessionId === subSessionId,
  );

  // The persisted transcript is the source of truth for what a sub-agent was
  // asked to do (its opening user message is written by the backend before
  // it runs, and never streamed as an event), so always reconcile with it on
  // mount rather than only when nothing else has populated the store yet —
  // a live thread built purely from stream events would otherwise lack it,
  // and a tab reopened after an app restart has nothing else to show at all.
  // Also re-run whenever its status changes: a sub-agent that fails or
  // finishes without a reply gets its outcome written as a final message
  // (`chat::run_sub_agent`/`acp::run_sub_agent_acp`) that's persisted but
  // never streamed, so an already-open tab would otherwise never show it.
  // `status` comes from the lifecycle-driven `useSubAgents` query, so the
  // transition can't be missed the way a per-sub-agent stream event can.
  const status = task?.status;
  useEffect(() => {
    let cancelled = false;
    api.loadConversationHistory(subSessionId).then((messages) => {
      if (cancelled) return;
      const persisted = messagesToEntries(messages);
      // Once it's finished, disk has the whole transcript (including that
      // final message), so it replaces the live copy outright; while it's
      // still running, live events are ahead of disk and win.
      setSubAgentEntries(subSessionId, (prev) =>
        status === "done" || status === "error"
          ? persisted
          : reconcileWithPersisted(prev, persisted),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [subSessionId, setSubAgentEntries, status]);

  const running = status === "running";
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
