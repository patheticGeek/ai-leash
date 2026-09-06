import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store";

interface TextEntry {
  kind: "text";
  role: "user" | "assistant";
  content: string;
  time: number;
}

interface ThinkingEntry {
  kind: "thinking";
  content: string;
  done: boolean;
}

interface ToolEntry {
  kind: "tool";
  callId: string;
  name: string;
  args: unknown;
  result?: string;
}

type Entry = TextEntry | ThinkingEntry | ToolEntry;

interface ToolCallPayload {
  id: string | null;
  name: string;
  arguments: unknown;
}

interface ToolResultPayload {
  id: string | null;
  result: string;
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      className={`inline-block text-zinc-600 transition-transform ${expanded ? "rotate-90" : ""}`}
    >
      ▸
    </span>
  );
}

const iconProps = {
  width: 12,
  height: 12,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CopyIcon() {
  return (
    <svg {...iconProps}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...iconProps}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg {...iconProps}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ChatPanel() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const models = useAppStore((s) => s.ollamaModels);
  const ollamaConnected = useAppStore((s) => s.ollamaConnected);
  const refreshOllama = useAppStore((s) => s.refreshOllama);
  const [model, setModel] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expandOverride, setExpandOverride] = useState<Record<number, boolean>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshOllama();
  }, [refreshOllama]);

  useEffect(() => {
    if (sending) return;
    const interval = setInterval(refreshOllama, 5000);
    return () => clearInterval(interval);
  }, [sending, refreshOllama]);

  useEffect(() => {
    if (!model && models.length) setModel(models[0]);
  }, [models, model]);

  useEffect(() => {
    if (ollamaConnected === false) {
      setOllamaError(
        "Could not reach Ollama at localhost:11434. Is `ollama serve` running?",
      );
    } else if (ollamaConnected === true) {
      setOllamaError(null);
    }
  }, [ollamaConnected]);

  useEffect(() => {
    const unlistenThinking = listen<string>(
      `chat://${sessionId}/thinking`,
      (e) => {
        setEntries((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.kind === "thinking" && !last.done) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + e.payload },
            ];
          }
          return [...prev, { kind: "thinking", content: e.payload, done: false }];
        });
      },
    );

    function finishThinking(prev: Entry[]): Entry[] {
      const last = prev[prev.length - 1];
      if (last && last.kind === "thinking" && !last.done) {
        return [...prev.slice(0, -1), { ...last, done: true }];
      }
      return prev;
    }

    const unlistenChunk = listen<string>(`chat://${sessionId}/chunk`, (e) => {
      setEntries((prev) => {
        const withFinishedThinking = finishThinking(prev);
        const last = withFinishedThinking[withFinishedThinking.length - 1];
        if (last && last.kind === "text" && last.role === "assistant") {
          return [
            ...withFinishedThinking.slice(0, -1),
            { ...last, content: last.content + e.payload },
          ];
        }
        return [
          ...withFinishedThinking,
          { kind: "text", role: "assistant", content: e.payload, time: Date.now() },
        ];
      });
    });

    const unlistenToolCall = listen<ToolCallPayload>(
      `chat://${sessionId}/tool_call`,
      (e) => {
        setEntries((prev) => [
          ...finishThinking(prev),
          {
            kind: "tool",
            callId: String(e.payload.id),
            name: e.payload.name,
            args: e.payload.arguments,
          },
        ]);
      },
    );

    const unlistenToolResult = listen<ToolResultPayload>(
      `chat://${sessionId}/tool_result`,
      (e) => {
        setEntries((prev) =>
          prev.map((entry) =>
            entry.kind === "tool" && entry.callId === String(e.payload.id)
              ? { ...entry, result: e.payload.result }
              : entry,
          ),
        );
      },
    );

    const unlistenDone = listen(`chat://${sessionId}/done`, () =>
      setSending(false),
    );
    const unlistenError = listen<string>(`chat://${sessionId}/error`, (e) => {
      setOllamaError(e.payload);
      setSending(false);
    });
    return () => {
      unlistenThinking.then((f) => f());
      unlistenChunk.then((f) => f());
      unlistenToolCall.then((f) => f());
      unlistenToolResult.then((f) => f());
      unlistenDone.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries]);

  function isExpanded(i: number): boolean {
    return expandOverride[i] ?? false;
  }

  function toggle(i: number) {
    setExpandOverride((prev) => ({ ...prev, [i]: !isExpanded(i) }));
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !model) return;
    setInput("");
    setOllamaError(null);
    setEntries((prev) => [
      ...prev,
      { kind: "text", role: "user", content: text, time: Date.now() },
    ]);
    setSending(true);
    try {
      await invoke("send_prompt", { sessionId, model, message: text });
    } catch (e) {
      setOllamaError(String(e));
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function stop() {
    await invoke("cancel_prompt", { sessionId });
    setSending(false);
  }

  async function copyText(i: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex((cur) => (cur === i ? null : cur)), 1200);
  }

  async function retry() {
    if (sending || !model) return;
    setOllamaError(null);
    setEntries((prev) => {
      for (let idx = prev.length - 1; idx >= 0; idx--) {
        const e = prev[idx];
        if (e.kind === "text" && e.role === "user") {
          return prev.slice(0, idx + 1);
        }
      }
      return prev;
    });
    setSending(true);
    try {
      await invoke("retry_last", { sessionId, model });
    } catch (e) {
      setOllamaError(String(e));
      setSending(false);
    }
  }

  const lastEntry = entries[entries.length - 1];
  const hasActivity =
    lastEntry &&
    ((lastEntry.kind === "text" && lastEntry.role === "assistant") ||
      lastEntry.kind === "thinking" ||
      lastEntry.kind === "tool");
  const awaitingFirstToken = sending && !hasActivity;

  return (
    <div className="flex h-full flex-col bg-[#0e0f12] border-l border-[#26272c]">
      <div className="flex h-9 items-center justify-between border-b border-[#26272c] px-3">
        <span className="text-sm font-medium text-zinc-200">Agent</span>
        <select
          value={model}
          onChange={(e) => setModel(e.currentTarget.value)}
          className="bg-[#17181c] border border-[#26272c] rounded text-xs text-zinc-300 px-2 py-1 outline-none"
        >
          {models.length === 0 && <option>no models</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {entries.length === 0 && !ollamaError && (
          <div className="text-zinc-500">
            Ask the agent anything about this project.
          </div>
        )}
        {ollamaError && (
          <div className="rounded border border-red-900/50 bg-red-950/30 px-3 py-2 text-red-300 text-xs">
            {ollamaError}
          </div>
        )}
        {entries.map((entry, i) => {
          if (entry.kind === "text") {
            const isLast = i === entries.length - 1;
            return (
              <div
                key={i}
                className={entry.role === "user" ? "text-zinc-200" : "text-zinc-300"}
              >
                <div className="flex items-center gap-2 mb-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
                  <span>{entry.role === "user" ? "you" : "agent"}</span>
                  <span className="normal-case tracking-normal text-zinc-700">
                    {formatTime(entry.time)}
                  </span>
                  <span className="flex-1" />
                  <button
                    onClick={() => copyText(i, entry.content)}
                    title="Copy"
                    className="text-zinc-600 hover:text-zinc-300"
                  >
                    {copiedIndex === i ? <CheckIcon /> : <CopyIcon />}
                  </button>
                  {!sending && isLast && (
                    <button
                      onClick={retry}
                      title="Retry"
                      className="text-zinc-600 hover:text-zinc-300"
                    >
                      <RetryIcon />
                    </button>
                  )}
                </div>
                <div className="whitespace-pre-wrap">{entry.content}</div>
              </div>
            );
          }
          if (entry.kind === "thinking") {
            const expanded = isExpanded(i);
            return (
              <div key={i} className="text-xs">
                <button
                  onClick={() => toggle(i)}
                  className="flex items-center gap-1.5 text-zinc-600 hover:text-zinc-400"
                >
                  <Chevron expanded={expanded} />
                  <span className="italic">generating slop…</span>
                </button>
                {expanded && (
                  <div className="mt-1 ml-4 whitespace-pre-wrap border-l-2 border-[#26272c] pl-2 italic text-zinc-600">
                    {entry.content}
                  </div>
                )}
              </div>
            );
          }
          const expanded = isExpanded(i);
          return (
            <div
              key={i}
              className="rounded border border-[#26272c] bg-[#141518] px-2.5 py-1.5 text-xs"
            >
              <button
                onClick={() => toggle(i)}
                className="flex w-full min-w-0 items-center gap-1.5 text-left text-zinc-400"
              >
                <Chevron expanded={expanded} />
                <span className="shrink-0 text-zinc-600">tool</span>
                <span className="shrink-0">{entry.name}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-600">
                  {JSON.stringify(entry.args)}
                </span>
                {entry.result === undefined && (
                  <span className="shrink-0 text-zinc-600">running…</span>
                )}
              </button>
              {expanded && (
                <div className="mt-1 pl-4">
                  <div className="truncate text-zinc-600">
                    {JSON.stringify(entry.args)}
                  </div>
                  {entry.result !== undefined && (
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-zinc-500">
                      {entry.result}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {awaitingFirstToken && <div className="text-zinc-600 text-xs">generating slop…</div>}
      </div>
      <div className="border-t border-[#26272c] p-2">
        {sending && (
          <div className="mb-2 flex justify-end">
            <button
              onClick={stop}
              className="flex items-center gap-1.5 rounded border border-[#26272c] bg-[#17181c] px-2.5 py-1 text-xs text-zinc-300 hover:border-red-900/50 hover:text-red-300"
            >
              <span className="inline-block h-2 w-2 bg-current" />
              Stop
            </button>
          </div>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask the agent..."
          rows={3}
          className="w-full resize-none rounded-md bg-[#17181c] border border-[#26272c] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#3a5f8f]"
        />
      </div>
    </div>
  );
}
