import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { isToolError, type Entry } from "../lib/chatEntries";
import Markdown from "./Markdown";

const statusStyles: Record<string, string> = {
  running: "text-amber-400 border-amber-900/50 bg-amber-950/20",
  done: "text-emerald-400 border-emerald-900/50 bg-emerald-950/20",
  error: "text-red-400 border-red-900/50 bg-red-950/20",
};

function EntryBlock({ entry }: { entry: Entry }) {
  if (entry.kind === "text") {
    return (
      <div className={entry.role === "user" ? "text-zinc-200" : "text-zinc-300"}>
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
        failed ? "border-red-900/50 bg-red-950/10" : "border-[#26272c] bg-[#141518]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-zinc-400">
        <span className={`shrink-0 ${failed ? "text-red-400" : "text-zinc-600"}`}>tool</span>
        <span className="shrink-0">{entry.name}</span>
        <span className="min-w-0 flex-1 truncate text-zinc-600">{JSON.stringify(entry.args)}</span>
        {entry.result === undefined && <span className="shrink-0 text-zinc-600">running…</span>}
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

export default function SubAgentChatTab({ subSessionId }: { subSessionId: string }) {
  const entries = useAppStore((s) => s.subAgentThreads[subSessionId] ?? []);
  const task = useAppStore((s) => s.subAgentTasks.find((t) => t.subSessionId === subSessionId));
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    if (autoScrollRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [entries]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
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
        <span className="min-w-0 flex-1 truncate text-zinc-300">{task?.description}</span>
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-3 space-y-3">
        {entries.length === 0 && (
          <div className="text-sm text-zinc-600">Waiting for sub-agent output…</div>
        )}
        {entries.map((entry, i) => (
          <EntryBlock key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}
