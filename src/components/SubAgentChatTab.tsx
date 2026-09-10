import { Wrench } from "lucide-react";
import { useEffect, useRef } from "react";
import { type Entry, isToolError, messagesToEntries } from "../lib/chatEntries";
import { api } from "../lib/tauriApi";
import { useAppStore } from "../store";
import Markdown from "./Markdown";

const statusStyles: Record<string, string> = {
  running: "text-amber-400 border-amber-900/50 bg-amber-950/20",
  done: "text-emerald-400 border-emerald-900/50 bg-emerald-950/20",
  error: "text-red-400 border-red-900/50 bg-red-950/20",
};

function EntryBlock({ entry }: { entry: Entry }) {
  if (entry.kind === "text") {
    return (
      <div
        className={entry.role === "user" ? "text-zinc-200" : "text-zinc-300"}
      >
        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
          {entry.role === "user" ? "task" : "sub-agent"}
        </div>
        {entry.role === "user" ? (
          <div className="whitespace-pre-wrap text-sm">{entry.content}</div>
        ) : (
          <Markdown content={entry.content} />
        )}
      </div>
    );
  }
  if (entry.kind === "thinking") {
    return (
      <div className="text-xs italic text-zinc-600">
        {entry.content}
        {!entry.done && "…"}
      </div>
    );
  }
  const failed = isToolError(entry.result);
  return (
    <div
      className={`rounded border px-2.5 py-1.5 text-xs ${
        failed
          ? "border-red-900/50 bg-red-950/10"
          : "border-[#26272c] bg-[#141518]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-zinc-400">
        <Wrench
          size={12}
          className={`shrink-0 ${failed ? "text-red-400" : "text-zinc-600"}`}
        />
        <span className="shrink-0">{entry.name}</span>
        <span className="min-w-0 flex-1 truncate text-zinc-600">
          {JSON.stringify(entry.args)}
        </span>
        {entry.result === undefined && (
          <span className="shrink-0 text-zinc-600">running…</span>
        )}
      </div>
      {entry.result !== undefined && (
        <pre
          className={`mt-1 max-h-40 overflow-auto whitespace-pre-wrap ${
            failed ? "text-red-300" : "text-zinc-500"
          }`}
        >
          {entry.result}
        </pre>
      )}
    </div>
  );
}

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: entries is a trigger-only dep — re-run the scroll check on every new message, its value isn't read in the body
  useEffect(() => {
    if (autoScrollRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [entries]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    autoScrollRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  return (
    <div className="flex h-full flex-col bg-[#0e0f12]">
      <div className="flex items-center gap-2 border-b border-[#26272c] px-3 py-2 text-xs">
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 uppercase tracking-wide ${
            statusStyles[task?.status ?? "done"]
          }`}
        >
          {task?.status === "running" ? "running…" : (task?.status ?? "done")}
        </span>
        <span className="min-w-0 flex-1 truncate text-zinc-300">
          {task?.description}
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 select-text overflow-y-auto p-3 space-y-3"
      >
        {entries.length === 0 && (
          <div className="text-sm text-zinc-600">
            Waiting for sub-agent output…
          </div>
        )}
        {entries.map((entry, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: entries are append-only, never reordered/filtered, and carry no stable id
          <EntryBlock key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}
