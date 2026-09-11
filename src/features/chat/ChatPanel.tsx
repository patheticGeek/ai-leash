import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import type { AcpCommandInfo } from "../../lib/tauriApi";
import { api } from "../../lib/tauriApi";
import { permissionForSession, useAppStore } from "../../store";
import ChatEntryList from "./components/ChatEntryList";
import ChatInputBar from "./components/ChatInputBar";
import ContextUsageRing from "./components/ContextUsageRing";
import ModelPickerPopover from "./components/ModelPickerPopover";
import PermissionModePopover from "./components/PermissionModePopover";
import {
  COMPACT_COMMAND,
  LOCAL_COMMANDS,
  useChatSession,
} from "./hooks/useChatSession";
import { useChatStream } from "./hooks/useChatStream";

export default function ChatPanel() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  // A project's conversation id is its own path — stable across app
  // restarts (so `load_conversation_history` can find it again), one
  // conversation per project for now. `CenterPanel` remounts `ChatPanel`
  // whenever `projectRoot` changes, so this only ever runs once per project.
  const [sessionId] = useState(() => projectRoot ?? crypto.randomUUID());
  const providerConfigFor = useAppStore((s) => s.providerConfigFor);

  // Ask/Bypass permission mode for this conversation — see
  // `setPermissionMode`'s doc comment in store.ts. Enforcement is
  // backend-side and in-memory only, so this pushes whatever's already
  // stored down to it once per mount (this component remounts per project,
  // same as `sessionId` above) to restore it after an app restart.
  const permissionMode = useAppStore(
    (s) => s.permissionMode[sessionId] ?? "ask",
  );
  const setPermissionMode = useAppStore((s) => s.setPermissionMode);
  const [permissionModePickerOpen, setPermissionModePickerOpen] =
    useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only re-sync (see comment above) — must not re-fire when permissionMode itself changes
  useEffect(() => {
    setPermissionMode(sessionId, permissionMode);
  }, [sessionId]);
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
  const resolvePendingPermission = useAppStore(
    (s) => s.resolvePendingPermission,
  );
  const pendingPermission = permissionForSession(pendingPermissions, sessionId);
  const clearSubAgentTasksForParent = useAppStore(
    (s) => s.clearSubAgentTasksForParent,
  );
  // Backend-driven, independent of this component's mount lifecycle (see
  // `run_with_cancellation` in chat.rs and `LeftBar.tsx`'s always-mounted
  // subscriber) — this is what lets `sending` come back correctly true if
  // you switch back to a project whose turn kept running while you were
  // looking at a different one. Excludes *autonomous* turns (the model
  // reacting to a finished background sub-agent) — the user isn't waiting
  // on those, so they shouldn't show the Stop button or block a new send;
  // see `autonomousGeneratingSessions`.
  const generating = useAppStore(
    (s) =>
      !!s.generatingSessions[sessionId] &&
      !s.autonomousGeneratingSessions[sessionId],
  );

  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  // Initialized from the global (backend-driven) state so a session that's
  // already generating shows correctly on first paint, not just after the
  // sync effect below runs. `send`/`retry`/`stop` still set this directly
  // too, for instant feedback ahead of the round-trip.
  const [sending, setSending] = useState(() => {
    const st = useAppStore.getState();
    return (
      !!st.generatingSessions[sessionId] &&
      !st.autonomousGeneratingSessions[sessionId]
    );
  });
  useEffect(() => {
    setSending(generating);
  }, [generating]);

  // Slash-command popover bookkeeping — "/model" opening the picker without
  // a real click lives here too (`runLocalCommand` below), which is why
  // `modelPickerOpen` isn't just internal state of `ModelPickerPopover`.
  const [slashDismissed, setSlashDismissed] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const {
    isAcp,
    isOpenAiCompatible,
    providerActiveId,
    activeAcpAgent,
    acpCommands,
    model,
    setModel,
    contextLength,
    backendOptions,
    activeBackendKey,
    activeBackendLabel,
    selectBackendOption,
  } = useChatSession(sessionId, setOllamaError, sending, () =>
    setSlashDismissed(null),
  );
  const { entries, setEntries, usage, setUsage, systemPrompt } = useChatStream(
    sessionId,
    setOllamaError,
  );

  // Drives the "Working for <time>" indicator below the transcript — a
  // ticking clock rather than a static label, since a turn can run for
  // minutes (tool calls, sub-agents) and a frozen "generating…" gives no
  // sense of how long that's actually been going on.
  const [sendStartedAt, setSendStartedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Once a turn finishes, its elapsed time is frozen here (keyed by the
  // finished assistant reply's own index in `entries`) so the reply's
  // footer can keep showing "Worked for <time>" instead of reverting to a
  // plain timestamp — refs because the effect below only fires on the
  // `sending` transition and needs whatever `entries`/`sendStartedAt` were
  // current *at that moment*, not whatever they were when the effect was
  // last set up.
  const [turnDurations, setTurnDurations] = useState<Record<number, number>>(
    {},
  );
  const sendStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    sendStartedAtRef.current = sendStartedAt;
  }, [sendStartedAt]);
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  useEffect(() => {
    if (!sending) {
      const startedAt = sendStartedAtRef.current;
      if (startedAt) {
        const seconds = Math.max(
          0,
          Math.round((Date.now() - startedAt) / 1000),
        );
        const list = entriesRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const e = list[i];
          if (e.kind === "text" && e.role === "assistant") {
            setTurnDurations((prev) => ({ ...prev, [i]: seconds }));
            break;
          }
          if (e.kind === "text" && e.role === "user") break;
        }
      }
      setSendStartedAt(null);
      return;
    }
    setSendStartedAt((prev) => prev ?? Date.now());
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [sending]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // "/compact" only exists for the built-in provider loop — see
  // `COMPACT_COMMAND`. Local commands first, then whatever the connected
  // ACP agent advertises (skipping any name a local command already
  // covers) — see `LOCAL_COMMANDS`.
  const localCommands = isAcp
    ? LOCAL_COMMANDS
    : [...LOCAL_COMMANDS, COMPACT_COMMAND];
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
        // The backend also deletes any sub-agent this conversation spawned
        // (see `db::clear_conversation`) — drop them from local state too,
        // so the Sub Agents sidebar and any open sub-agent tab don't keep
        // pointing at now-deleted rows.
        clearSubAgentTasksForParent(sessionId);
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
        const summary = await api.compactConversation(
          sessionId,
          providerConfigFor(providerActiveId),
          model,
        );
        setEntries([
          {
            kind: "info",
            content: `Conversation compacted:\n\n${summary}`,
            time: Date.now(),
          },
        ]);
        setUsage(null);
      } catch (e) {
        setOllamaError(String(e));
      } finally {
        setSending(false);
      }
    }
  }

  // "!<command>" never reaches the model — it runs `command` as a shell
  // command right away (no permission prompt: typing it here *is* the
  // approval) and the result lands in the transcript as a tool call, same
  // as `/clear`'s "never sent as a prompt" local commands above, just with
  // its own backend round trip instead of being purely client-side (see
  // `run_shell_command` in `tools.rs` for why: it still needs to persist a
  // real tool-call/result pair so this survives a reload).
  async function runShellEscape(command: string) {
    if (sending) return;
    setInput("");
    setOllamaError(null);
    setSending(true);
    try {
      await api.runShellCommand(sessionId, command);
    } catch (e) {
      setOllamaError(String(e));
    } finally {
      setSending(false);
    }
  }

  async function send() {
    setHelpOpen(false);
    // A leading space before "!" (" !foo") escapes out of shell mode — for
    // when you actually want to send a message starting with "!" as text.
    // Checked on the raw, untrimmed value, since trim() below would
    // otherwise erase the one signal that distinguishes it from the shell
    // escape below.
    const isEscapedBang = input.startsWith(" !");
    const text = input.trim();
    const bangMatch = !isEscapedBang && /^!(\S.*)$/s.exec(text);
    if (bangMatch) {
      await runShellEscape(bangMatch[1]);
      return;
    }
    const localMatch = /^\/(\S+)$/.exec(text);
    if (localMatch && localCommands.some((c) => c.name === localMatch[1])) {
      await runLocalCommand(localMatch[1]);
      return;
    }
    if (!text || sending || (!isAcp && !model) || (isAcp && !activeAcpAgent))
      return;
    setInput("");
    setOllamaError(null);
    setEntries((prev) => [
      ...prev,
      { kind: "text", role: "user", content: text, time: Date.now() },
    ]);
    setSending(true);
    try {
      if (isAcp && activeAcpAgent) {
        await api.sendPromptAcp(
          sessionId,
          activeAcpAgent.launchCommand,
          providerConfigFor(providerActiveId),
          model,
          text,
        );
      } else {
        await api.sendPrompt(
          sessionId,
          providerConfigFor(providerActiveId),
          model,
          text,
        );
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
      ? allCommands.filter((c) =>
          c.name.toLowerCase().startsWith(slashQuery.toLowerCase()),
        )
      : [];
  const showSlashPopover =
    slashMatches.length > 0 && slashDismissed !== slashQuery;
  const slashActiveIndex = Math.min(slashIndex, slashMatches.length - 1);
  // Mirrors `send()`'s own check — a leading space ("!" escaped as " !")
  // means "just send this as text", so it's not shell mode either.
  const shellMode = input.startsWith("!");

  // biome-ignore lint/correctness/useExhaustiveDependencies: slashQuery is a trigger-only dep — reset the highlighted index whenever the typed query changes, its value isn't read in the body
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
      await api.retryLast(
        sessionId,
        providerConfigFor(providerActiveId),
        model,
      );
    } catch (e) {
      setOllamaError(String(e));
      setSending(false);
    }
  }

  const usedTokens = usage ? usage.prompt + usage.completion : null;

  return (
    <div className="flex mx-auto max-w-4xl h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        <ChatEntryList
          entries={entries}
          ollamaError={ollamaError}
          systemPrompt={systemPrompt}
          sending={sending}
          isAcp={isAcp}
          turnDurations={turnDurations}
          sendStartedAt={sendStartedAt}
          nowTick={nowTick}
          onRetry={retry}
        />
        {helpOpen && (
          <div className="absolute inset-0 z-10 flex flex-col bg-[#0e0f12]">
            <div className="flex items-center justify-between shadow-[var(--al-shadow-b)] px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Commands
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setHelpOpen(false)}
                title="Close"
              >
                <X size={14} />
              </Button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
              <div className="rounded-md shadow-[var(--al-shadow)] bg-[#17181c] px-3 py-2">
                <div className="text-sm font-medium text-zinc-100">
                  !<span className="text-zinc-500"> command</span>
                </div>
                <div className="text-xs text-zinc-500">
                  Run a shell command directly — no permission prompt, result
                  shown as a tool call. Start with a space (" !...") to send a
                  literal message instead.
                </div>
              </div>
              {allCommands.map((c) => (
                <div
                  key={c.name}
                  className="rounded-md shadow-[var(--al-shadow)] bg-[#17181c] px-3 py-2"
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
      <ChatInputBar
        input={input}
        onChange={setInput}
        onKeyDown={onKeyDown}
        textareaRef={textareaRef}
        shellMode={shellMode}
        pendingPermission={pendingPermission}
        onRespondPermission={respondPermission}
        showSlashPopover={showSlashPopover}
        slashMatches={slashMatches}
        slashActiveIndex={slashActiveIndex}
        onAcceptSlash={acceptSlashCommand}
        sending={sending}
        onSend={send}
        onStop={stop}
        sendDisabled={
          !input.trim() || (!isAcp && !model) || (isAcp && !activeAcpAgent)
        }
        toolbarLeft={
          <>
            <ModelPickerPopover
              options={backendOptions}
              activeKey={activeBackendKey}
              onSelect={selectBackendOption}
              triggerLabel={activeBackendLabel}
              open={modelPickerOpen}
              onOpenChange={setModelPickerOpen}
            />
            <PermissionModePopover
              mode={permissionMode}
              onSelect={(mode) => setPermissionMode(sessionId, mode)}
              open={permissionModePickerOpen}
              onOpenChange={setPermissionModePickerOpen}
            />
            {isOpenAiCompatible && !isAcp && (
              <Input
                variant="chip"
                value={model}
                onChange={(e) => setModel(e.currentTarget.value)}
                placeholder="model id"
              />
            )}
          </>
        }
        contextUsage={
          !isAcp &&
          usedTokens !== null && (
            <ContextUsageRing
              usedTokens={usedTokens}
              contextLength={contextLength}
            />
          )
        }
      />
    </div>
  );
}
