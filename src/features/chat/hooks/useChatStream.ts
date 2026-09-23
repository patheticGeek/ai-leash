import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import {
  appendChunk,
  appendThinking,
  appendToolCall,
  applyToolResult,
  type Entry,
  messagesToEntries,
  type ToolCallArgsPayload,
  type ToolCallPayload,
  type ToolResultPayload,
  updateToolArgs,
} from "../../../lib/chatEntries";
import { api } from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";

export interface SubtaskThread {
  subSessionId: string;
  description: string;
  entries: Entry[];
}

// The output of a local command that belongs in the transcript (currently
// just "/compact"'s summary — "/help" shows in its own overlay instead) —
// never sent through `push_message`/persisted, so it can't round-trip
// through `messagesToEntries` like every other `Entry` kind; it only ever
// exists in this hook's own `entries` state for the rest of the session.
export interface LocalInfoEntry {
  kind: "info";
  content: string;
  time: number;
}

// Extends the shared `ToolEntry` shape with UI-only nesting for subtasks
// spawned by this specific tool call — not part of the shared type since
// sub-agents can't themselves spawn further subtasks, so their own entries
// (`SubtaskThread.entries` above) never need this.
export type PanelEntry =
  | Exclude<Entry, { kind: "tool" }>
  | (Extract<Entry, { kind: "tool" }> & { subtasks?: SubtaskThread[] })
  | LocalInfoEntry;

interface SubtaskStartPayload {
  callId: string | null;
  subSessionId: string;
  description: string;
  prompt: string;
  model: string;
  effort: string | null;
}

function addSubtaskThread(
  prev: PanelEntry[],
  callId: string,
  subSessionId: string,
  description: string,
  firstEntries: Entry[],
): PanelEntry[] {
  return prev.map((entry) =>
    entry.kind === "tool" &&
    entry.callId === callId &&
    // Idempotent — see `startSubAgentTask`'s doc comment (same
    // StrictMode-double-invoke race, same fix): without this, a raced
    // `subtask_start` would also nest this sub-agent's thread twice under
    // the tool-call bubble, not just duplicate its sidebar entry.
    !entry.subtasks?.some((t) => t.subSessionId === subSessionId)
      ? {
          ...entry,
          subtasks: [
            ...(entry.subtasks ?? []),
            { subSessionId, description, entries: firstEntries },
          ],
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
    if (entry.kind !== "tool" || entry.callId !== callId || !entry.subtasks)
      return entry;
    const idx = entry.subtasks.findIndex(
      (t) => t.subSessionId === subSessionId,
    );
    if (idx === -1) return entry;
    const subtasks = [...entry.subtasks];
    subtasks[idx] = {
      ...subtasks[idx],
      entries: updater(subtasks[idx].entries),
    };
    return { ...entry, subtasks };
  });
}

// Owns this conversation's transcript (`entries`), token usage, and system
// prompt — everything driven by the `chat://{sessionId}/...` event stream
// (see `docs/features/agent-chat.md`) plus the one-time history load on
// mount. Doesn't own whether a turn is in flight (`sending` in
// `ChatPanel.tsx` is derived from backend-global state, not from this
// stream — see its own doc comment) or the error banner text (reported up
// via `setError` instead, since plenty of other, non-streaming actions in
// `ChatPanel.tsx` set it too).
export function useChatStream(
  sessionId: string,
  setError: (message: string) => void,
) {
  const startSubAgentTask = useAppStore((s) => s.startSubAgentTask);
  const finishSubAgentTask = useAppStore((s) => s.finishSubAgentTask);
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const setSubAgentEntries = useAppStore((s) => s.setSubAgentEntries);

  const [entries, setEntries] = useState<PanelEntry[]>([]);
  const [usage, setUsage] = useState<{
    prompt: number;
    completion: number;
    contextLength?: number;
  } | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  // Set when this ACP agent couldn't resume its previous session (its own
  // session store expired or was cleared) — distinct from `error` (plain
  // string banner) since this one offers a "start new" action rather than
  // just reporting failure. Cleared by `ChatPanel.tsx` right before it
  // retries the connection (see `warm_acp_session`), so the banner drops
  // immediately rather than lingering until a second failure would
  // overwrite it.
  const [acpRestoreFailed, setAcpRestoreFailed] = useState<string | null>(null);
  // True when the currently-connected ACP agent has no way to pick up this
  // conversation's prior history — either it doesn't advertise `loadSession`
  // at all, or it's simply never handled this specific conversation before
  // (e.g. just switched to it from a different agent). Backend emits this on
  // every connect, true or false, so it self-corrects the moment a
  // reconnect (agent switch back, `/clear`, retry) lands on a connection
  // that *can* resume — see `chat://{sessionId}/acp_history_truncated`.
  const [acpHistoryTruncated, setAcpHistoryTruncated] = useState(false);
  // A pending Claude session limit, pushed by the backend on
  // `chat://{sessionId}/rate_limit` (null when there's none) and read once on
  // mount — the backend derives it from the transcript and owns the
  // auto-resume timer, so it survives tab switches and app restarts. Distinct
  // from `error` (plain banner) since it offers an auto-resume choice.
  const [rateLimit, setRateLimit] = useState<{
    message: string;
    resetAt: number;
    armed: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getRateLimitResume(sessionId).then((pending) => {
      if (!cancelled) setRateLimit((prev) => prev ?? pending);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

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

  useEffect(() => {
    const unlistens: Promise<() => void>[] = [];

    unlistens.push(
      listen<string | null>(`chat://${sessionId}/system_prompt`, (e) => {
        setSystemPrompt(e.payload);
      }),
    );
    // The four `chatEntries.ts` helpers below only know about the shared
    // `Entry` union, not this hook's local-only `"info"` entries (see
    // `LocalInfoEntry`) — but they treat whatever's already in `prev`
    // opaquely (only ever inspecting the *last* entry's `kind` to decide
    // whether to append or extend), so an `"info"` entry sitting in the
    // array is harmless: it just doesn't match `"thinking"`/`"text"`,
    // falling through to "append a new entry" exactly as any other
    // unrelated kind already would. The cast is safe on that basis, not a
    // real type hole.
    unlistens.push(
      listen<string>(`chat://${sessionId}/thinking`, (e) => {
        setEntries(
          (prev) => appendThinking(prev as Entry[], e.payload) as PanelEntry[],
        );
      }),
    );
    unlistens.push(
      listen<string>(`chat://${sessionId}/chunk`, (e) => {
        setEntries(
          (prev) => appendChunk(prev as Entry[], e.payload) as PanelEntry[],
        );
      }),
    );
    unlistens.push(
      listen<ToolCallPayload>(`chat://${sessionId}/tool_call`, (e) => {
        setEntries(
          (prev) => appendToolCall(prev as Entry[], e.payload) as PanelEntry[],
        );
      }),
    );
    unlistens.push(
      listen<ToolResultPayload>(`chat://${sessionId}/tool_result`, (e) => {
        setEntries(
          (prev) => applyToolResult(prev as Entry[], e.payload) as PanelEntry[],
        );
      }),
    );
    unlistens.push(
      listen<ToolCallArgsPayload>(`chat://${sessionId}/tool_call_args`, (e) => {
        setEntries(
          (prev) => updateToolArgs(prev as Entry[], e.payload) as PanelEntry[],
        );
      }),
    );
    unlistens.push(
      listen<{
        promptTokens: number;
        completionTokens: number;
        contextLength?: number;
      }>(`chat://${sessionId}/usage`, (e) => {
        setUsage({
          prompt: e.payload.promptTokens,
          completion: e.payload.completionTokens,
          contextLength: e.payload.contextLength,
        });
      }),
    );
    // No `done` handler needed here for `sending` — that's derived from the
    // backend-driven `generating` global state instead (see `ChatPanel.tsx`),
    // which is cleared right alongside `done`/`error` in `run_with_cancellation`.
    unlistens.push(
      listen<string>(`chat://${sessionId}/error`, (e) => {
        setError(e.payload);
      }),
    );
    unlistens.push(
      listen<typeof rateLimit>(`chat://${sessionId}/rate_limit`, (e) => {
        setRateLimit(e.payload);
      }),
    );
    // A prompt the backend sent on the user's behalf (the rate-limit
    // auto-resume) — typed messages are added optimistically by `ChatPanel`.
    unlistens.push(
      listen<string>(`chat://${sessionId}/user_message`, (e) => {
        setEntries((prev) => [
          ...prev,
          { kind: "text", role: "user", content: e.payload, time: Date.now() },
        ]);
      }),
    );
    unlistens.push(
      listen<string>(`chat://${sessionId}/acp_session_restore_failed`, (e) => {
        setAcpRestoreFailed(e.payload);
      }),
    );
    unlistens.push(
      listen<boolean>(`chat://${sessionId}/acp_history_truncated`, (e) => {
        setAcpHistoryTruncated(e.payload);
      }),
    );

    // A `spawn_sub_agent` tool call spawns an isolated sub-agent with its own
    // chat://{subSessionId}/... event stream, one per concurrently spawned
    // subtask (a single `spawn_sub_agent` call can request several).
    // Subscribe to each stream dynamically and fold its updates into that
    // subtask's own thread, nested under the parent tool call once expanded.
    unlistens.push(
      listen<SubtaskStartPayload>(`chat://${sessionId}/subtask_start`, (e) => {
        const { subSessionId, description, prompt, model, effort } = e.payload;
        const callId = String(e.payload.callId);

        // The backend persists the prompt as the sub-agent's first user
        // message before it streams anything, but never emits it — seed it
        // here so the live thread matches what a reload from disk shows.
        // Also marks the thread as populated, so `SubAgentChatTab` doesn't
        // fetch from disk and clobber the live entries.
        const promptEntry: Entry = {
          kind: "text",
          role: "user",
          content: prompt,
          time: Date.now(),
        };
        setEntries((prev) =>
          addSubtaskThread(prev, callId, subSessionId, description, [
            promptEntry,
          ]),
        );
        setSubAgentEntries(subSessionId, () => [promptEntry]);
        startSubAgentTask({
          subSessionId,
          parentSessionId: sessionId,
          description,
          model,
          effort: effort ?? undefined,
        });
        // Surface the running sub-agent immediately rather than leaving the
        // user to notice it under a collapsed tool-call entry.
        openPanelTab("subagents");

        const doneListener = listen(`chat://${subSessionId}/done`, () => {
          finishSubAgentTask(subSessionId, "done");
        });
        const errorListener = listen(`chat://${subSessionId}/error`, () => {
          finishSubAgentTask(subSessionId, "error");
        });
        unlistens.push(doneListener, errorListener);
        // A sub-agent that finishes near-instantly (e.g. an immediate
        // provider error, no streaming at all) can resolve before the two
        // listeners just above have actually finished registering —
        // `listen()` is itself an async round trip, so emitting
        // `subtask_start` first doesn't guarantee it. Once they're attached,
        // reconcile once against the backend's current state so a finish
        // that raced past them still gets picked up, instead of leaving this
        // stuck on "running" until the next full reload.
        Promise.all([doneListener, errorListener]).then(async () => {
          const rows = await api.listSubAgents(sessionId).catch(() => []);
          const row = rows.find((r) => r.id === subSessionId);
          if (row && row.status !== "running") {
            finishSubAgentTask(subSessionId, row.status);
          }
        });
        unlistens.push(
          listen<string>(`chat://${subSessionId}/thinking`, (ev) => {
            setEntries((prev) =>
              updateSubtaskThread(prev, callId, subSessionId, (sub) =>
                appendThinking(sub, ev.payload),
              ),
            );
            unlistens.push(
              listen<string | null>(`chat://${sessionId}/title`, (e) => {
                setSessionTitle(e.payload);
              }),
            );
            setSubAgentEntries(subSessionId, (prev) =>
              appendThinking(prev, ev.payload),
            );
          }),
        );
        unlistens.push(
          listen<string>(`chat://${subSessionId}/chunk`, (ev) => {
            setEntries((prev) =>
              updateSubtaskThread(prev, callId, subSessionId, (sub) =>
                appendChunk(sub, ev.payload),
              ),
            );
            setSubAgentEntries(subSessionId, (prev) =>
              appendChunk(prev, ev.payload),
            );
          }),
        );
        unlistens.push(
          listen<ToolCallPayload>(`chat://${subSessionId}/tool_call`, (ev) => {
            setEntries((prev) =>
              updateSubtaskThread(prev, callId, subSessionId, (sub) =>
                appendToolCall(sub, ev.payload),
              ),
            );
            setSubAgentEntries(subSessionId, (prev) =>
              appendToolCall(prev, ev.payload),
            );
          }),
        );
        unlistens.push(
          listen<ToolResultPayload>(
            `chat://${subSessionId}/tool_result`,
            (ev) => {
              setEntries((prev) =>
                updateSubtaskThread(prev, callId, subSessionId, (sub) =>
                  applyToolResult(sub, ev.payload),
                ),
              );
              setSubAgentEntries(subSessionId, (prev) =>
                applyToolResult(prev, ev.payload),
              );
            },
          ),
        );
        unlistens.push(
          listen<ToolCallArgsPayload>(
            `chat://${subSessionId}/tool_call_args`,
            (ev) => {
              setEntries((prev) =>
                updateSubtaskThread(prev, callId, subSessionId, (sub) =>
                  updateToolArgs(sub, ev.payload),
                ),
              );
              setSubAgentEntries(subSessionId, (prev) =>
                updateToolArgs(prev, ev.payload),
              );
            },
          ),
        );
      }),
    );

    return () => {
      unlistens.forEach((u) => {
        u.then((f) => f());
      });
    };
  }, [
    sessionId,
    startSubAgentTask,
    finishSubAgentTask,
    openPanelTab,
    setSubAgentEntries,
    setError,
  ]);

  return {
    entries,
    setEntries,
    usage,
    setUsage,
    sessionTitle,
    systemPrompt,
    acpRestoreFailed,
    clearAcpRestoreFailed: () => setAcpRestoreFailed(null),
    acpHistoryTruncated,
    claudeRateLimit: rateLimit,
    claudeAutoResumeArmed: rateLimit?.armed ?? false,
    armClaudeAutoResume: () => api.armRateLimitResume(sessionId),
    dismissClaudeRateLimit: () => api.dismissRateLimitResume(sessionId),
  };
}
