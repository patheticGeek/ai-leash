import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store";
import {
  type Entry,
  type ToolCallPayload,
  type ToolResultPayload,
  appendThinking,
  appendChunk,
  appendToolCall,
  applyToolResult,
  isToolError,
} from "../lib/chatEntries";

interface SubtaskThread {
  subSessionId: string;
  description: string;
  entries: Entry[];
}

// Extends the shared `ToolEntry` shape with UI-only nesting for subtasks
// spawned by this specific tool call — not part of the shared type since
// sub-agents can't themselves spawn further subtasks, so their own entries
// (`SubtaskThread.entries` above) never need this.
type PanelEntry =
  | Exclude<Entry, { kind: "tool" }>
  | (Extract<Entry, { kind: "tool" }> & { subtasks?: SubtaskThread[] });

interface SubtaskStartPayload {
  callId: string | null;
  subSessionId: string;
  description: string;
}

function addSubtaskThread(
  prev: PanelEntry[],
  callId: string,
  subSessionId: string,
  description: string,
): PanelEntry[] {
  return prev.map((entry) =>
    entry.kind === "tool" && entry.callId === callId
      ? {
          ...entry,
          subtasks: [...(entry.subtasks ?? []), { subSessionId, description, entries: [] }],
        }
      : entry,
  );
}

function updateSubtaskThread(
  prev: PanelEntry[],
  callId: string,
  subSessionId: string,
  updater: (entries: Entry[]) => Entry[],
): PanelEntry[] {
  return prev.map((entry) => {
    if (entry.kind !== "tool" || entry.callId !== callId || !entry.subtasks) return entry;
    const idx = entry.subtasks.findIndex((t) => t.subSessionId === subSessionId);
    if (idx === -1) return entry;
    const subtasks = [...entry.subtasks];
    subtasks[idx] = { ...subtasks[idx], entries: updater(subtasks[idx].entries) };
    return { ...entry, subtasks };
  });
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

function SendIcon() {
  return (
    <svg {...iconProps} width={14} height={14}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

function SubEntryLine({ entry }: { entry: Entry }) {
  if (entry.kind === "text") {
    return (
      <div className={entry.role === "user" ? "text-zinc-400" : "text-zinc-500"}>
        <div className="text-[9px] uppercase tracking-wide text-zinc-700">
          {entry.role === "user" ? "task" : "sub-agent"}
        </div>
        <div className="whitespace-pre-wrap">{entry.content}</div>
      </div>
    );
  }
  if (entry.kind === "thinking") {
    return (
      <div className="italic text-zinc-700">
        {entry.done ? "thought" : "thinking…"}
      </div>
    );
  }
  const failed = isToolError(entry.result);
  return (
    <div
      className={`rounded border px-2 py-1 ${
        failed
          ? "border-red-900/50 bg-red-950/20 text-red-300"
          : "border-[#26272c] bg-[#101114] text-zinc-500"
      }`}
    >
      <span className={failed ? "text-red-400" : "text-zinc-700"}>tool</span> {entry.name}
      {failed && <span className="text-red-400"> · failed</span>}
      {entry.result === undefined ? (
        <span className="text-zinc-700"> · running…</span>
      ) : (
        <div className="mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap opacity-90">
          {entry.result}
        </div>
      )}
    </div>
  );
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatTokenCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const LAST_MODEL_KEY = "ai-leash:lastModel";
const INPUT_MIN_ROWS = 3;
const INPUT_MAX_ROWS = 6;

export default function ChatPanel() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const models = useAppStore((s) => s.ollamaModels);
  const ollamaConnected = useAppStore((s) => s.ollamaConnected);
  const refreshOllama = useAppStore((s) => s.refreshOllama);
  const startSubAgentTask = useAppStore((s) => s.startSubAgentTask);
  const finishSubAgentTask = useAppStore((s) => s.finishSubAgentTask);
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const setSubAgentEntries = useAppStore((s) => s.setSubAgentEntries);
  const [model, setModel] = useState("");
  const [entries, setEntries] = useState<PanelEntry[]>([]);
  const [expandOverride, setExpandOverride] = useState<Record<number, boolean>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ prompt: number; completion: number } | null>(null);
  const [showUsagePopover, setShowUsagePopover] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    refreshOllama();
  }, [refreshOllama]);

  useEffect(() => {
    if (sending) return;
    const interval = setInterval(refreshOllama, 5000);
    return () => clearInterval(interval);
  }, [sending, refreshOllama]);

  useEffect(() => {
    if (model || !models.length) return;
    const last = localStorage.getItem(LAST_MODEL_KEY);
    const restored = last && models.some((m) => m.name === last) ? last : null;
    setModel(restored ?? models[0].name);
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
    const unlistens: Promise<() => void>[] = [];

    unlistens.push(
      listen<string | null>(`chat://${sessionId}/system_prompt`, (e) => {
        setSystemPrompt(e.payload);
      }),
    );
    unlistens.push(
      listen<string>(`chat://${sessionId}/thinking`, (e) => {
        setEntries((prev) => appendThinking(prev, e.payload));
      }),
    );
    unlistens.push(
      listen<string>(`chat://${sessionId}/chunk`, (e) => {
        setEntries((prev) => appendChunk(prev, e.payload));
      }),
    );
    unlistens.push(
      listen<ToolCallPayload>(`chat://${sessionId}/tool_call`, (e) => {
        setEntries((prev) => appendToolCall(prev, e.payload));
      }),
    );
    unlistens.push(
      listen<ToolResultPayload>(`chat://${sessionId}/tool_result`, (e) => {
        setEntries((prev) => applyToolResult(prev, e.payload));
      }),
    );
    unlistens.push(
      listen<{ promptTokens: number; completionTokens: number }>(
        `chat://${sessionId}/usage`,
        (e) => {
          setUsage({
            prompt: e.payload.promptTokens,
            completion: e.payload.completionTokens,
          });
        },
      ),
    );
    unlistens.push(listen(`chat://${sessionId}/done`, () => setSending(false)));
    unlistens.push(
      listen<string>(`chat://${sessionId}/error`, (e) => {
        setOllamaError(e.payload);
        setSending(false);
      }),
    );

    // A `spawn_sub_agent` tool call spawns an isolated sub-agent with its own
    // chat://{subSessionId}/... event stream, one per concurrently spawned
    // subtask (a single `spawn_sub_agent` call can request several).
    // Subscribe to each stream dynamically and fold its updates into that
    // subtask's own thread, nested under the parent tool call once expanded.
    unlistens.push(
      listen<SubtaskStartPayload>(`chat://${sessionId}/subtask_start`, (e) => {
        const { subSessionId, description } = e.payload;
        const callId = String(e.payload.callId);

        setEntries((prev) => addSubtaskThread(prev, callId, subSessionId, description));
        startSubAgentTask({ subSessionId, parentSessionId: sessionId, description });
        // Surface the running sub-agent immediately rather than leaving the
        // user to notice it under a collapsed tool-call entry.
        openPanelTab("subagents");

        unlistens.push(
          listen(`chat://${subSessionId}/done`, () => {
            finishSubAgentTask(subSessionId, "done");
          }),
        );
        unlistens.push(
          listen(`chat://${subSessionId}/error`, () => {
            finishSubAgentTask(subSessionId, "error");
          }),
        );
        unlistens.push(
          listen<string>(`chat://${subSessionId}/thinking`, (ev) => {
            setEntries((prev) =>
              updateSubtaskThread(prev, callId, subSessionId, (sub) =>
                appendThinking(sub, ev.payload),
              ),
            );
            setSubAgentEntries(subSessionId, (prev) => appendThinking(prev, ev.payload));
          }),
        );
        unlistens.push(
          listen<string>(`chat://${subSessionId}/chunk`, (ev) => {
            setEntries((prev) =>
              updateSubtaskThread(prev, callId, subSessionId, (sub) =>
                appendChunk(sub, ev.payload),
              ),
            );
            setSubAgentEntries(subSessionId, (prev) => appendChunk(prev, ev.payload));
          }),
        );
        unlistens.push(
          listen<ToolCallPayload>(`chat://${subSessionId}/tool_call`, (ev) => {
            setEntries((prev) =>
              updateSubtaskThread(prev, callId, subSessionId, (sub) =>
                appendToolCall(sub, ev.payload),
              ),
            );
            setSubAgentEntries(subSessionId, (prev) => appendToolCall(prev, ev.payload));
          }),
        );
        unlistens.push(
          listen<ToolResultPayload>(`chat://${subSessionId}/tool_result`, (ev) => {
            setEntries((prev) =>
              updateSubtaskThread(prev, callId, subSessionId, (sub) =>
                applyToolResult(sub, ev.payload),
              ),
            );
            setSubAgentEntries(subSessionId, (prev) => applyToolResult(prev, ev.payload));
          }),
        );
      }),
    );

    return () => {
      unlistens.forEach((u) => u.then((f) => f()));
    };
  }, [sessionId, startSubAgentTask, finishSubAgentTask, openPanelTab, setSubAgentEntries]);

  useEffect(() => {
    if (autoScrollRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [entries]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < 40;
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const minHeight = lineHeight * INPUT_MIN_ROWS + paddingY;
    const maxHeight = lineHeight * INPUT_MAX_ROWS + paddingY;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input]);

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

  const selectedModel = models.find((m) => m.name === model);
  const contextLength = selectedModel?.contextLength ?? null;
  const usedTokens = usage ? usage.prompt + usage.completion : null;
  const usagePct =
    usedTokens !== null && contextLength ? Math.min(100, (usedTokens / contextLength) * 100) : null;

  return (
    <div className="flex h-full flex-col bg-[#0e0f12]">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto p-3 space-y-3 text-sm"
      >
        {systemPrompt && (
          <div className="text-xs">
            <button
              onClick={() => setSystemPromptExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-zinc-600 hover:text-zinc-400"
            >
              <Chevron expanded={systemPromptExpanded} />
              <span className="italic">system prompt</span>
            </button>
            {systemPromptExpanded && (
              <pre className="mt-1 ml-4 max-h-64 overflow-auto whitespace-pre-wrap border-l-2 border-[#26272c] pl-2 text-zinc-600">
                {systemPrompt}
              </pre>
            )}
          </div>
        )}
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
                  <span className="normal-case tracking-normal text-zinc-700">
                    {formatTime(entry.time)}
                  </span>
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
          const failed = isToolError(entry.result);
          return (
            <div
              key={i}
              className={`rounded border px-2.5 py-1.5 text-xs ${
                failed ? "border-red-900/50 bg-red-950/10" : "border-[#26272c] bg-[#141518]"
              }`}
            >
              <button
                onClick={() => toggle(i)}
                className="flex w-full min-w-0 items-center gap-1.5 text-left text-zinc-400"
              >
                <Chevron expanded={expanded} />
                <span className={`shrink-0 ${failed ? "text-red-400" : "text-zinc-600"}`}>
                  tool
                </span>
                <span className="shrink-0">{entry.name}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-600">
                  {JSON.stringify(entry.args)}
                </span>
                {entry.result === undefined && (
                  <span className="shrink-0 text-zinc-600">running…</span>
                )}
                {failed && <span className="shrink-0 text-red-400">failed</span>}
              </button>
              {expanded && (
                <div className="mt-1 pl-4">
                  <div className="truncate text-zinc-600">
                    {JSON.stringify(entry.args)}
                  </div>
                  {entry.subtasks && entry.subtasks.length > 0 && (
                    <div className="mt-1.5 space-y-2">
                      {entry.subtasks.map((t) => (
                        <div key={t.subSessionId} className="border-l-2 border-[#26272c] pl-2">
                          <div className="mb-0.5 text-[9px] uppercase tracking-wide text-zinc-700">
                            {t.description}
                          </div>
                          <div className="space-y-1.5">
                            {t.entries.map((sub, j) => (
                              <SubEntryLine key={j} entry={sub} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
              )}
            </div>
          );
        })}
        {awaitingFirstToken && <div className="text-zinc-600 text-xs">generating slop…</div>}
      </div>
      <div className="border-t border-[#26272c] p-2">
        <div className="flex flex-col rounded-md border border-[#26272c] bg-[#17181c] focus-within:border-[#3a5f8f]">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask the agent..."
            rows={INPUT_MIN_ROWS}
            className="w-full resize-none bg-transparent px-3 pt-2 pb-1 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
          />
          <div className="flex items-center justify-between gap-1.5 px-1.5 pb-1.5">
            <select
              value={model}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setModel(value);
                localStorage.setItem(LAST_MODEL_KEY, value);
              }}
              className="min-w-0 rounded border border-[#26272c] bg-[#17181c] px-1 py-0.5 text-xs text-zinc-400 outline-none"
            >
              {models.length === 0 && <option>no models</option>}
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
            {usedTokens !== null && (
              <div
                className="relative"
                onMouseEnter={() => setShowUsagePopover(true)}
                onMouseLeave={() => setShowUsagePopover(false)}
              >
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background:
                      usagePct !== null
                        ? `conic-gradient(#3a5f8f ${usagePct}%, #26272c ${usagePct}% 100%)`
                        : "#26272c",
                  }}
                >
                  <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#17181c] text-[7px] text-zinc-400">
                    {usagePct !== null ? Math.round(usagePct) : "–"}
                  </div>
                </div>
                {showUsagePopover && (
                  <div className="absolute bottom-full right-0 z-10 mb-2 w-48 rounded-md border border-[#26272c] bg-[#141518] p-2.5 shadow-xl">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Context usage</span>
                      <span className="font-medium text-zinc-200">
                        {usagePct !== null ? `${usagePct.toFixed(0)}%` : "–"}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1c1d21]">
                      <div
                        className="h-full bg-[#3a5f8f]"
                        style={{ width: `${usagePct ?? 0}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-600">
                      <span>{formatTokenCount(usedTokens)} used</span>
                      <span>
                        {contextLength ? formatTokenCount(contextLength) : "?"} total
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={sending ? stop : send}
              disabled={!sending && (!input.trim() || !model)}
              title={sending ? "Stop" : "Send"}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white disabled:cursor-not-allowed disabled:opacity-40 ${
                sending
                  ? "bg-red-600/80 hover:bg-red-600"
                  : "bg-[#3a5f8f] hover:bg-[#4a6f9f] disabled:hover:bg-[#3a5f8f]"
              }`}
            >
              {sending ? <StopIcon /> : <SendIcon />}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
