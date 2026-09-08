import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Bot, Wrench } from "lucide-react";
import { useAppStore, permissionForSession } from "../store";
import { api, type AcpCommandInfo, type AcpModelOptions } from "../lib/tauriApi";
import Markdown from "./Markdown";
import ModelPickerPopover, { type PickerOption } from "./ModelPickerPopover";
import PermissionPopover from "./PermissionPopover";
import {
  type Entry,
  type ToolCallPayload,
  type ToolResultPayload,
  appendThinking,
  appendChunk,
  appendToolCall,
  applyToolResult,
  isToolError,
  messagesToEntries,
} from "../lib/chatEntries";

interface SubtaskThread {
  subSessionId: string;
  description: string;
  entries: Entry[];
}

// The output of a local command that belongs in the transcript (currently
// just "/compact"'s summary — "/help" shows in its own overlay instead, see
// `helpOpen`) — never sent through `push_message`/persisted, so it can't
// round-trip through `messagesToEntries` like every other `Entry` kind; it
// only ever exists in this component's own `entries` state for the rest of
// the session.
interface LocalInfoEntry {
  kind: "info";
  content: string;
  time: number;
}

// Extends the shared `ToolEntry` shape with UI-only nesting for subtasks
// spawned by this specific tool call — not part of the shared type since
// sub-agents can't themselves spawn further subtasks, so their own entries
// (`SubtaskThread.entries` above) never need this.
type PanelEntry =
  | Exclude<Entry, { kind: "tool" }>
  | (Extract<Entry, { kind: "tool" }> & { subtasks?: SubtaskThread[] })
  | LocalInfoEntry;

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

function XIcon() {
  return (
    <svg {...iconProps}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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
        {entry.role === "user" ? (
          <div className="whitespace-pre-wrap">{entry.content}</div>
        ) : (
          <Markdown content={entry.content} />
        )}
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
      <Wrench
        size={11}
        className={`inline-block -mt-0.5 mr-1 ${failed ? "text-red-400" : "text-zinc-700"}`}
      />
      {entry.name}
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

// Commands we handle ourselves, client-side, rather than sending as a
// prompt — no ACP agent implements a matching request (the protocol
// doesn't define one), so these exist purely as local UI bookkeeping.
// Listed alongside whatever the connected ACP agent advertises (see
// `acpCommands`) so they show up in the same autocomplete popover; a
// local command wins over an agent-advertised one of the same name.
const LOCAL_COMMANDS: AcpCommandInfo[] = [
  { name: "clear", description: "Clear this conversation's history", hint: null },
  { name: "model", description: "Open the model/agent picker", hint: null },
  { name: "help", description: "List available commands", hint: null },
];

// Only offered for the built-in provider loop we drive ourselves — an ACP
// agent's real context lives inside its own subprocess, so there's nothing
// to compact from out here, and some agents implement a genuine "/compact"
// of their own that intercepting the name locally would otherwise shadow.
// Kept separate from `LOCAL_COMMANDS` so `isAcp` conversations never list
// or intercept it, letting an agent-advertised "/compact" (if any) pass
// straight through as a normal prompt like any other agent command.
const COMPACT_COMMAND: AcpCommandInfo = {
  name: "compact",
  description: "Summarize this conversation to reclaim context",
  hint: null,
};

export default function ChatPanel() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  // A project's conversation id is its own path — stable across app
  // restarts (so `load_conversation_history` can find it again), one
  // conversation per project for now. `CenterPanel` remounts `ChatPanel`
  // whenever `projectRoot` changes, so this only ever runs once per project.
  const [sessionId] = useState(() => projectRoot ?? crypto.randomUUID());
  const models = useAppStore((s) => s.ollamaModels);
  const providerConnectivity = useAppStore((s) => s.providerConnectivity);
  const refreshOllama = useAppStore((s) => s.refreshOllama);
  const providerConfigFor = useAppStore((s) => s.providerConfigFor);
  const providerSettings = useAppStore((s) => s.providerSettings);
  const setActiveProvider = useAppStore((s) => s.setActiveProvider);
  const agentBackend = useAppStore((s) => s.agentBackend);
  const setAgentBackendKind = useAppStore((s) => s.setAgentBackendKind);
  const setActiveAcpAgent = useAppStore((s) => s.setActiveAcpAgent);
  const acpModelCache = useAppStore((s) => s.acpModelCache);
  // This conversation's own backend/model choice — read once at mount (this
  // component remounts per project, so `sessionId` is stable for its whole
  // lifetime) from whatever it last used, falling back to the shared
  // defaults above only the very first time this conversation is opened.
  // From here on this is the source of truth for *this* conversation;
  // switching to a different one can't change what this shows, and picking
  // something new here doesn't leak into other conversations (only into
  // the shared defaults new, never-touched ones inherit — see
  // `setConversationBackend` below).
  const setConversationBackend = useAppStore((s) => s.setConversationBackend);
  const [kind, setKind] = useState<"builtin" | "acp">(() => {
    const st = useAppStore.getState();
    return st.conversationBackend[sessionId]?.kind ?? st.agentBackend.kind;
  });
  const [providerActiveId, setProviderActiveId] = useState<string>(() => {
    const st = useAppStore.getState();
    return st.conversationBackend[sessionId]?.providerActiveId ?? st.providerSettings.activeId;
  });
  const [acpActiveId, setAcpActiveId] = useState<string | null>(() => {
    const st = useAppStore.getState();
    return st.conversationBackend[sessionId]?.acpActiveId ?? st.agentBackend.activeAcpId;
  });
  const [acpModelChoice, setAcpModelChoice] = useState<string | null>(
    () => useAppStore.getState().conversationBackend[sessionId]?.acpModel ?? null,
  );
  const isAcp = kind === "acp";
  const isOpenAiCompatible = !isAcp && providerActiveId !== "ollama";
  const activeAcpAgent = agentBackend.acpAgents.find((c) => c.id === acpActiveId);
  // Only set if the connected ACP agent advertises a Model config option
  // (see docs/features/agent-chat.md) — most agents won't, in which case
  // this stays null and no model dropdown shows for ACP mode.
  const [acpModelOptions, setAcpModelOptions] = useState<AcpModelOptions | null>(null);
  // Slash commands the connected ACP agent advertises, if any — most agents
  // won't send this notification at all, in which case typing "/" does
  // nothing special. See `chat://{sessionId}/acp_commands` below.
  const [acpCommands, setAcpCommands] = useState<AcpCommandInfo[]>([]);
  const [slashDismissed, setSlashDismissed] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  // Lifted out of `ModelPickerPopover` so the "/model" local command can
  // open it without a real click.
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  // "/help" shows an overlay over the messages area rather than adding an
  // entry to the transcript — closed by its own X button or, more usually,
  // implicitly by sending the next message (see the top of `send()`).
  const [helpOpen, setHelpOpen] = useState(false);
  // Resolves to a real request only while this project (or a sub-agent it
  // spawned) has one pending — see `permissionForSession`. Global listeners
  // that populate `pendingPermissions` live in `LeftBar.tsx`, always
  // mounted regardless of which project is currently open, same pattern as
  // `generatingSessions`.
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const resolvePendingPermission = useAppStore((s) => s.resolvePendingPermission);
  const pendingPermission = permissionForSession(pendingPermissions, sessionId);
  const startSubAgentTask = useAppStore((s) => s.startSubAgentTask);
  const finishSubAgentTask = useAppStore((s) => s.finishSubAgentTask);
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const setSubAgentEntries = useAppStore((s) => s.setSubAgentEntries);
  // Backend-driven, independent of this component's mount lifecycle (see
  // `run_with_cancellation` in chat.rs and `LeftBar.tsx`'s always-mounted
  // subscriber) — this is what lets `sending` come back correctly true if
  // you switch back to a project whose turn kept running while you were
  // looking at a different one. Excludes *autonomous* turns (the model
  // reacting to a finished background sub-agent) — the user isn't waiting
  // on those, so they shouldn't show the Stop button or block a new send;
  // see `autonomousGeneratingSessions`.
  const generating = useAppStore(
    (s) => !!s.generatingSessions[sessionId] && !s.autonomousGeneratingSessions[sessionId],
  );
  const [model, setModel] = useState(
    () => useAppStore.getState().conversationBackend[sessionId]?.model ?? "",
  );
  const [entries, setEntries] = useState<PanelEntry[]>([]);
  const [expandOverride, setExpandOverride] = useState<Record<number, boolean>>({});
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [input, setInput] = useState("");
  // Initialized from the global (backend-driven) state so a session that's
  // already generating shows correctly on first paint, not just after the
  // sync effect below runs. `send`/`retry`/`stop` still set this directly
  // too, for instant feedback ahead of the round-trip.
  const [sending, setSending] = useState(() => {
    const st = useAppStore.getState();
    return !!st.generatingSessions[sessionId] && !st.autonomousGeneratingSessions[sessionId];
  });

  useEffect(() => {
    setSending(generating);
  }, [generating]);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ prompt: number; completion: number } | null>(null);
  const [showUsagePopover, setShowUsagePopover] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Suppresses exactly one *real* run of the reset effect below, for the
  // "switch agent and pick one of its models in the same click" case (set
  // by `selectBackendOption`). Deliberately *not* relied on to protect the
  // effect's very first run at mount — see `lastResetAcpActiveIdRef` for
  // why a consume-once flag alone isn't safe there.
  const skipNextAcpResetRef = useRef(false);
  // The reset effect only does its work when `acpActiveId` has actually
  // changed since the last time it ran — tracked here instead of relying
  // solely on `skipNextAcpResetRef`, because React StrictMode deliberately
  // double-invokes every effect on mount (setup → cleanup → setup again) to
  // catch non-idempotent effects, and a "run once, consume a flag" guard is
  // exactly that: the first of the two mount-time invocations consumes the
  // flag, so the *second* one runs for real and wipes the `acpModelChoice`
  // this conversation just restored from persisted state, on every fresh
  // mount. Comparing against the last value this effect actually processed
  // is idempotent no matter how many times it's invoked with the same
  // `acpActiveId`, which a plain boolean flag can't guarantee.
  const lastResetAcpActiveIdRef = useRef(acpActiveId);
  // Tracks the last `acpModelChoice` actually sent to the *current*
  // connection, so the apply-effect doesn't resend it every time some
  // unrelated dependency changes, and so a fresh connection (after an
  // agent switch) knows it hasn't applied anything yet.
  const appliedAcpModelRef = useRef<string | null>(null);

  useEffect(() => {
    api.loadConversationHistory(sessionId).then((messages) => {
      const loaded = messagesToEntries(messages);
      if (loaded.length === 0) return;
      // Guards against clobbering a live event that already arrived while
      // this load was in flight (shouldn't happen in practice — nothing can
      // send a message before the UI has mounted — but it's a cheap check).
      setEntries((prev) => (prev.length === 0 ? loaded : prev));
    });
  }, [sessionId]);

  // Keeps this conversation's own choice durable across remounts (a project
  // switch away and back, or an app restart) — writes the full snapshot
  // whenever any piece of it changes. Also backfills a record for a
  // conversation that's never explicitly picked anything yet, which is
  // harmless (it's just re-saving the same defaults it read at mount).
  useEffect(() => {
    setConversationBackend(sessionId, {
      kind,
      providerActiveId,
      acpActiveId,
      model,
      acpModel: acpModelChoice,
    });
  }, [sessionId, kind, providerActiveId, acpActiveId, model, acpModelChoice, setConversationBackend]);

  // Model options are per-connection (they only exist once a session's ACP
  // subprocess replies to session/new) — clear the stale ones, and the
  // previously-chosen model, whenever which ACP agent is active changes.
  // Suppressed once by `selectBackendOption` when it's switching agent AND
  // setting a model choice in the same click — otherwise this would wipe
  // that choice right back out before it ever got a chance to apply.
  useEffect(() => {
    if (lastResetAcpActiveIdRef.current === acpActiveId) return;
    lastResetAcpActiveIdRef.current = acpActiveId;
    if (skipNextAcpResetRef.current) {
      skipNextAcpResetRef.current = false;
      return;
    }
    setAcpModelOptions(null);
    setAcpModelChoice(null);
    appliedAcpModelRef.current = null;
    setAcpCommands([]);
    setSlashDismissed(null);
  }, [acpActiveId]);

  // Applies a model choice (from the unified popover's per-model ACP rows)
  // once a real connection actually reports its options — either right
  // after the first prompt connects, or immediately if the agent was
  // already connected when a different model was picked. Reopening a
  // conversation restores its last `acpModelChoice` from persisted state
  // (see the lazy `useState` initializer above), so this also re-applies it
  // to a freshly (re)connected subprocess after an app restart.
  useEffect(() => {
    if (!acpModelOptions || !acpModelChoice) return;
    if (appliedAcpModelRef.current === acpModelChoice) return;
    if (acpModelOptions.currentValue !== acpModelChoice) {
      selectAcpModel(acpModelChoice);
    }
    appliedAcpModelRef.current = acpModelChoice;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acpModelOptions, acpModelChoice]);

  useEffect(() => {
    refreshOllama();
  }, [refreshOllama]);

  useEffect(() => {
    if (sending) return;
    const interval = setInterval(refreshOllama, 5000);
    return () => clearInterval(interval);
  }, [sending, refreshOllama]);

  // Ollama has no live models yet the first time a brand-new conversation
  // opens on it — fill in a sensible one once the list loads. Conversations
  // that already have a `model` (from their own persisted choice, or from
  // just having picked one) are left alone.
  useEffect(() => {
    if (isOpenAiCompatible || isAcp) return;
    if (model || !models.length) return;
    const last = localStorage.getItem(LAST_MODEL_KEY);
    const restored = last && models.some((m) => m.name === last) ? last : null;
    setModel(restored ?? models[0].name);
  }, [models, model, isOpenAiCompatible, isAcp]);

  // This conversation's own active provider's reachability — looked up from
  // the app-wide per-provider map (`providerConnectivity`, refreshed
  // regardless of which conversation is open) rather than a single global
  // "the active provider is connected" flag, since which provider counts as
  // "active" is now per-conversation.
  useEffect(() => {
    if (isAcp) return;
    const connected = providerConnectivity[providerActiveId];
    if (connected === false) {
      setOllamaError(
        providerActiveId === "ollama"
          ? `Could not reach Ollama at ${providerSettings.ollama.host || "localhost:11434"}. Is \`ollama serve\` running?`
          : "Could not reach the configured provider. Check the base URL and API key in provider settings.",
      );
    } else if (connected === true) {
      setOllamaError(null);
    }
  }, [providerConnectivity, providerActiveId, isAcp, providerSettings.ollama.host]);

  useEffect(() => {
    const unlistens: Promise<() => void>[] = [];

    unlistens.push(
      listen<string | null>(`chat://${sessionId}/system_prompt`, (e) => {
        setSystemPrompt(e.payload);
      }),
    );
    // The four `chatEntries.ts` helpers below only know about the shared
    // `Entry` union, not this component's local-only `"info"` entries (see
    // `LocalInfoEntry`) — but they treat whatever's already in `prev`
    // opaquely (only ever inspecting the *last* entry's `kind` to decide
    // whether to append or extend), so an `"info"` entry sitting in the
    // array is harmless: it just doesn't match `"thinking"`/`"text"`,
    // falling through to "append a new entry" exactly as any other
    // unrelated kind already would. The cast is safe on that basis, not a
    // real type hole.
    unlistens.push(
      listen<string>(`chat://${sessionId}/thinking`, (e) => {
        setEntries((prev) => appendThinking(prev as Entry[], e.payload) as PanelEntry[]);
      }),
    );
    unlistens.push(
      listen<string>(`chat://${sessionId}/chunk`, (e) => {
        setEntries((prev) => appendChunk(prev as Entry[], e.payload) as PanelEntry[]);
      }),
    );
    unlistens.push(
      listen<ToolCallPayload>(`chat://${sessionId}/tool_call`, (e) => {
        setEntries((prev) => appendToolCall(prev as Entry[], e.payload) as PanelEntry[]);
      }),
    );
    unlistens.push(
      listen<ToolResultPayload>(`chat://${sessionId}/tool_result`, (e) => {
        setEntries((prev) => applyToolResult(prev as Entry[], e.payload) as PanelEntry[]);
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
    // No `done` handler needed here for `sending` — that's now derived from
    // the backend-driven `generating` global state (see above), which is
    // cleared right alongside `done`/`error` in `run_with_cancellation`.
    unlistens.push(
      listen<string>(`chat://${sessionId}/error`, (e) => {
        setOllamaError(e.payload);
      }),
    );
    unlistens.push(
      listen<AcpModelOptions>(`chat://${sessionId}/acp_model_options`, (e) => {
        setAcpModelOptions(e.payload);
      }),
    );
    unlistens.push(
      listen<AcpCommandInfo[]>(`chat://${sessionId}/acp_commands`, (e) => {
        setAcpCommands(e.payload);
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

  // "/compact" only exists for the built-in provider loop — see
  // `COMPACT_COMMAND`. Local commands first, then whatever the connected
  // ACP agent advertises (skipping any name a local command already
  // covers) — see `LOCAL_COMMANDS`.
  const localCommands = isAcp ? LOCAL_COMMANDS : [...LOCAL_COMMANDS, COMPACT_COMMAND];
  const allCommands = [
    ...localCommands,
    ...acpCommands.filter((c) => !localCommands.some((l) => l.name === c.name)),
  ];

  // Runs a local command entirely client-side — never sent to the
  // model/agent as a prompt. Blocked while `sending`, same as `retry`:
  // "/clear"/"/compact" mid-turn would let that turn's own `push_message`
  // calls land right back in the history either just wiped or is about to
  // replace (see `chat::clear_conversation`'s doc comment).
  async function runLocalCommand(name: string) {
    if (sending) return;
    setInput("");
    if (name === "clear") {
      setOllamaError(null);
      try {
        await api.clearConversation(sessionId);
        setEntries([]);
        setUsage(null);
      } catch (e) {
        setOllamaError(String(e));
      }
      return;
    }
    if (name === "model") {
      setModelPickerOpen(true);
      return;
    }
    if (name === "help") {
      setHelpOpen(true);
      return;
    }
    if (name === "compact") {
      if (isAcp || !model) return;
      setOllamaError(null);
      setSending(true);
      try {
        const summary = await api.compactConversation(sessionId, providerConfigFor(providerActiveId), model);
        setEntries([
          { kind: "info", content: `Conversation compacted:\n\n${summary}`, time: Date.now() },
        ]);
        setUsage(null);
      } catch (e) {
        setOllamaError(String(e));
      } finally {
        setSending(false);
      }
    }
  }

  async function send() {
    setHelpOpen(false);
    const text = input.trim();
    const localMatch = /^\/(\S+)$/.exec(text);
    if (localMatch && localCommands.some((c) => c.name === localMatch[1])) {
      await runLocalCommand(localMatch[1]);
      return;
    }
    if (!text || sending || (!isAcp && !model) || (isAcp && !activeAcpAgent)) return;
    setInput("");
    setOllamaError(null);
    setEntries((prev) => [
      ...prev,
      { kind: "text", role: "user", content: text, time: Date.now() },
    ]);
    setSending(true);
    try {
      if (isAcp && activeAcpAgent) {
        await api.sendPromptAcp(sessionId, activeAcpAgent.launchCommand, text);
      } else {
        await api.sendPrompt(sessionId, providerConfigFor(providerActiveId), model, text);
      }
    } catch (e) {
      setOllamaError(String(e));
      setSending(false);
    }
  }

  // Slash-command autocomplete: only triggers when the *entire* input is
  // "/" followed by a run of non-space characters — i.e. the user is still
  // typing the command name itself. Typing a space (moving on to args) or
  // anything else drops out of match automatically, no explicit "close"
  // needed for that case.
  const slashQuery = /^\/(\S*)$/.exec(input)?.[1] ?? null;
  const slashMatches =
    slashQuery !== null
      ? allCommands.filter((c) => c.name.toLowerCase().startsWith(slashQuery.toLowerCase()))
      : [];
  const showSlashPopover = slashMatches.length > 0 && slashDismissed !== slashQuery;
  const slashActiveIndex = Math.min(slashIndex, slashMatches.length - 1);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  function acceptSlashCommand(cmd: AcpCommandInfo) {
    setInput(`/${cmd.name} `);
    setSlashDismissed(null);
    textareaRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlashPopover) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, slashMatches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        acceptSlashCommand(slashMatches[slashActiveIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(slashQuery);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function stop() {
    await api.cancelPrompt(sessionId);
    setSending(false);
  }

  // Clears the popover immediately (optimistic — no round-trip flicker)
  // rather than waiting for the backend's own `permission://resolved`,
  // which still fires regardless and is what makes this safe even when a
  // sub-agent's request got answered from its *parent's* popover instance.
  async function respondPermission(approved: boolean) {
    if (!pendingPermission) return;
    const id = pendingPermission.id;
    resolvePendingPermission(id);
    try {
      await api.respondPermission(id, approved);
    } catch (e) {
      setOllamaError(String(e));
    }
  }

  async function selectAcpModel(value: string) {
    setAcpModelOptions((prev) => (prev ? { ...prev, currentValue: value } : prev));
    try {
      await api.setAcpModel(sessionId, value);
    } catch (e) {
      setOllamaError(String(e));
    }
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
      await api.retryLast(sessionId, providerConfigFor(providerActiveId), model);
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

  // Providers and ACP agents are both just "who answers this chat" from the
  // user's point of view, so they share one picker instead of a hard
  // `isAcp` fork — picking any option here can flip this conversation's own
  // `kind` as a side effect. Ollama's own models are listed individually
  // (one entry per model), and so are an ACP agent's — using its cached
  // model list (see `acpModelCache`/`fetchAcpModelsFor` in store.ts) when
  // one's known, falling back to a single bare-agent row otherwise
  // (unfetched yet, or the agent doesn't expose a model to pick).
  const backendOptions: PickerOption[] = [
    ...(models.length > 0
      ? models.map((m) => ({ key: `ollama:${m.name}`, label: m.name, subtitle: "Ollama" }))
      : [{ key: "ollama", label: "Ollama", subtitle: providerSettings.ollama.host || "localhost:11434" }]),
    ...providerSettings.openAiCompatible.map((c) => ({
      key: `openai:${c.id}`,
      label: c.label,
      subtitle: "OpenAI-compatible",
    })),
    ...agentBackend.acpAgents.flatMap((c) => {
      // Prefer the throwaway-session cache (available for every saved
      // agent, not just the one this conversation has active), but fall
      // back to the *live* connection's own options for whichever agent
      // this conversation is actually connected to right now — that's
      // strictly fresher, and covers the rare case where the cache fetch
      // failed but a real chat still succeeded.
      const known = acpModelCache[c.id] ?? (c.id === acpActiveId ? acpModelOptions : null);
      if (known && known.options.length > 0) {
        return known.options.map((o) => ({
          key: `acp:${c.id}:${o.value}`,
          label: o.name,
          subtitle: `${c.label} · ACP`,
        }));
      }
      return [{ key: `acp:${c.id}`, label: c.label, subtitle: "ACP agent" }];
    }),
  ];
  // Falls all the way through to the cache's own `currentValue` (the
  // agent's actual default model, as reported by the discovery fetch) when
  // this conversation never explicitly chose one and isn't live-connected
  // yet — without this, `activeBackendKey` below would point at the bare
  // `acp:{agentId}` row, which stops existing in `backendOptions` the
  // moment the cache hydrates (once an agent has known models, its rows
  // are *only* per-model — see the `flatMap` above), so the lookup would
  // fail and silently fall back to showing the agent's own name as if it
  // were a model.
  const activeAcpModelValue =
    acpModelChoice ??
    acpModelOptions?.currentValue ??
    (activeAcpAgent ? acpModelCache[activeAcpAgent.id]?.currentValue : undefined) ??
    null;
  const activeBackendKey = isAcp
    ? activeAcpAgent
      ? activeAcpModelValue
        ? `acp:${activeAcpAgent.id}:${activeAcpModelValue}`
        : `acp:${activeAcpAgent.id}`
      : null
    : isOpenAiCompatible
      ? `openai:${providerActiveId}`
      : model
        ? `ollama:${model}`
        : "ollama";
  const activeBackendLabel = isAcp
    ? // A chosen model's friendly name comes from `backendOptions`, built
      // from `acpModelCache`/live `acpModelOptions` — but that cache can
      // still be loading (or have failed to load) right after switching to
      // this conversation, before it's had a chance to resolve. In that
      // window, fall back to the raw model value rather than the agent's
      // own label — showing "Claude Code" as if *it* were the selected
      // model would be actively wrong, not just imprecise. Only fall back
      // to the agent label when no model has actually been chosen at all.
      (backendOptions.find((o) => o.key === activeBackendKey)?.label ??
        activeAcpModelValue ??
        activeAcpAgent?.label ??
        "select agent")
    : isOpenAiCompatible
      ? (providerSettings.openAiCompatible.find((c) => c.id === providerActiveId)?.label ??
        "select provider")
      : model || "select model";

  function selectBackendOption(key: string) {
    if (key.startsWith("acp:")) {
      const rest = key.slice("acp:".length);
      const sepIdx = rest.indexOf(":");
      const agentId = sepIdx === -1 ? rest : rest.slice(0, sepIdx);
      const modelValue = sepIdx === -1 ? null : rest.slice(sepIdx + 1);
      if (modelValue && agentId !== acpActiveId) {
        // The agent-change reset effect (keyed on `acpActiveId`) would
        // otherwise immediately null back out the `acpModelChoice` we're
        // about to set in this same click. Only needed when we're setting
        // a real choice — picking the bare fallback row (no model known
        // yet) for a genuinely different agent should still let the reset
        // effect clear out the previous agent's stale `acpModelOptions`.
        skipNextAcpResetRef.current = true;
      }
      setKind("acp");
      setAcpActiveId(agentId);
      setAcpModelChoice(modelValue);
      // Also nudges the shared defaults, so a brand-new conversation opened
      // later starts from whatever was most recently picked anywhere.
      setAgentBackendKind("acp");
      setActiveAcpAgent(agentId);
    } else if (key.startsWith("openai:")) {
      const id = key.slice("openai:".length);
      const config = providerSettings.openAiCompatible.find((c) => c.id === id);
      setKind("builtin");
      setProviderActiveId(id);
      setModel(config?.model ?? "");
      setAgentBackendKind("builtin");
      setActiveProvider(id);
    } else {
      setKind("builtin");
      setProviderActiveId("ollama");
      setAgentBackendKind("builtin");
      setActiveProvider("ollama");
      if (key.startsWith("ollama:")) {
        const name = key.slice("ollama:".length);
        setModel(name);
        localStorage.setItem(LAST_MODEL_KEY, name);
      }
    }
  }

  const usagePct =
    usedTokens !== null && contextLength ? Math.min(100, (usedTokens / contextLength) * 100) : null;

  return (
    <div className="flex h-full flex-col bg-[#0e0f12]">
      <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto p-3 space-y-3 text-sm"
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
          if (entry.kind === "info") {
            return (
              <div
                key={i}
                className="rounded border border-[#26272c] bg-[#17181c] px-3 py-2 text-xs text-zinc-400"
              >
                <Markdown content={entry.content} />
              </div>
            );
          }
          if (entry.kind === "text") {
            const isLast = i === entries.length - 1;
            const isUser = entry.role === "user";
            return (
              <div
                key={i}
                className={`flex flex-col ${isUser ? "items-end text-zinc-200" : "items-start text-zinc-300"}`}
              >
                <Markdown content={entry.content} />
                  
                <div
                  className={`mt-2 flex items-center gap-2 mb-0.5 text-[10px] uppercase tracking-wide text-zinc-600 ${isUser ? "flex-row-reverse" : ""}`}
                >
                  <button
                    onClick={() => copyText(i, entry.content)}
                    title="Copy"
                    className="text-zinc-600 hover:text-zinc-300"
                  >
                    {copiedIndex === i ? <CheckIcon /> : <CopyIcon />}
                  </button>
                  {!sending && isLast && !isAcp && (
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
                {entry.name === "spawn_sub_agent" || entry.name === "sub_agent_result" ? (
                  <Bot size={12} className={`shrink-0 ${failed ? "text-red-400" : "text-zinc-600"}`} />
                ) : (
                  <Wrench size={12} className={`shrink-0 ${failed ? "text-red-400" : "text-zinc-600"}`} />
                )}
                <span className="shrink-0">{entry.name}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-600">
                  {!expanded ? JSON.stringify(entry.args) : ''}
                </span>
                {entry.result === undefined && (
                  <span className="shrink-0 text-zinc-600">running…</span>
                )}
                {failed && <span className="shrink-0 text-red-400">failed</span>}
              </button>
              {expanded && (
                <div className="mt-1 pl-4">
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-zinc-600">
                    {JSON.stringify(entry.args, null, 2)}
                  </pre>
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
      {helpOpen && (
        <div className="absolute inset-0 z-10 flex flex-col bg-[#0e0f12]">
          <div className="flex items-center justify-between border-b border-[#26272c] px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Commands
            </span>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              title="Close"
              className="text-zinc-500 hover:text-zinc-200"
            >
              <XIcon />
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {allCommands.map((c) => (
              <div
                key={c.name}
                className="rounded border border-[#26272c] bg-[#17181c] px-3 py-2"
              >
                <div className="text-sm font-medium text-zinc-100">
                  /{c.name}
                  {c.hint && <span className="text-zinc-500"> {c.hint}</span>}
                </div>
                <div className="text-xs text-zinc-500">{c.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
      <div className="p-2">
        <div className="relative flex flex-col rounded-md border border-[#26272c] bg-[#17181c] focus-within:border-[#3a5f8f]">
          {pendingPermission ? (
            <PermissionPopover request={pendingPermission} onRespond={respondPermission} />
          ) : (
            showSlashPopover && (
            <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-80 overflow-auto rounded-lg border border-[#26272c] bg-[#141518] py-1 shadow-2xl">
              {slashMatches.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    acceptSlashCommand(c);
                  }}
                  className={`block w-full px-3 py-1.5 text-left ${
                    i === slashActiveIndex ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-100">
                    /{c.name}
                    {c.hint && <span className="text-zinc-500"> {c.hint}</span>}
                  </div>
                  <div className="text-xs text-zinc-500">{c.description}</div>
                </button>
              ))}
            </div>
            )
          )}
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
            <div className="flex min-w-0 items-center gap-1.5">
              <ModelPickerPopover
                options={backendOptions}
                activeKey={activeBackendKey}
                onSelect={selectBackendOption}
                triggerLabel={activeBackendLabel}
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
              />
              {isOpenAiCompatible && !isAcp && (
                <input
                  value={model}
                  onChange={(e) => setModel(e.currentTarget.value)}
                  placeholder="model id"
                  className="min-w-0 rounded border border-[#26272c] bg-[#17181c] px-1 py-0.5 text-xs text-zinc-400 outline-none"
                />
              )}
            </div>
            <div className="flex items-center gap-1.5">
            {!isAcp && usedTokens !== null && (
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
              disabled={
                !sending &&
                (!input.trim() || (!isAcp && !model) || (isAcp && !activeAcpAgent))
              }
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
