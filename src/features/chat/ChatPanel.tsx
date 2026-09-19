import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useGenerating } from "../../lib/generatingQuery";
import type { AcpCommandInfo } from "../../lib/tauriApi";
import { api } from "../../lib/tauriApi";
import { useAppStore } from "../../store";
import ChatBanners from "./components/banners/ChatBanners";
import ChatInputBar from "./components/composer/ChatInputBar";
import ChatToolbar from "./components/composer/ChatToolbar";
import CheckoutBar from "./components/composer/CheckoutBar";
import ContextUsageRing from "./components/composer/ContextUsageRing";
import NewThreadView from "./components/empty-states/NewThreadView";
import ChatEntryList from "./components/messages/ChatEntryList";
import { useAcpWarmup } from "./hooks/useAcpWarmup";
import { useChatInput } from "./hooks/useChatInput";
import {
  COMPACT_COMMAND,
  LOCAL_COMMANDS,
  useChatSession,
} from "./hooks/useChatSession";
import { useChatStream } from "./hooks/useChatStream";
import { useMessageQueue } from "./hooks/useMessageQueue";
import { useSessionPermissions } from "./hooks/useSessionPermissions";
import { useSlashCommands } from "./hooks/useSlashCommands";
import { useTurnDurations } from "./hooks/useTurnDurations";

export default function ChatPanel({
  sessionId,
  projectRoot,
}: {
  sessionId: string;
  projectRoot: string;
}) {
  const providerConfigFor = useAppStore((s) => s.providerConfigFor);
  const conversations = useAppStore((s) => s.conversations);
  const markConversationStarted = useAppStore((s) => s.markConversationStarted);
  const setConversationCheckoutPath = useAppStore(
    (s) => s.setConversationCheckoutPath,
  );
  const setConversationTitle = useAppStore((s) => s.setConversationTitle);
  const clearSubAgentTasksForParent = useAppStore(
    (s) => s.clearSubAgentTasksForParent,
  );
  // A conversation not yet in `conversations` has never had a message
  // sent — the centered "new thread" layout below, rather than the normal
  // bottom-pinned one. Flips (without a remount: `sessionId` itself never
  // changes) the instant `submitPrompt` calls `markConversationStarted`.
  const isNewThread = !conversations.some((c) => c.id === sessionId);
  const conversation = conversations.find((c) => c.id === sessionId);
  // A worktree picked via `CheckoutBar` before this still-new thread's first
  // message — `null` means the primary checkout (the default set by
  // `startNewConversation`). Once the conversation has a real row, its own
  // `worktreePath` takes over instead — fixed for the rest of its life, so
  // there's no analogous "update" path needed for an already-started one.
  const [pendingWorktree, setPendingWorktree] = useState<string | null>(null);
  const worktreeCwd = isNewThread
    ? (pendingWorktree ?? projectRoot)
    : (conversation?.worktreePath ?? projectRoot);
  const projectName = useAppStore(
    (s) =>
      s.recentProjects.find((p) => p.path === projectRoot)?.name ?? projectRoot,
  );

  // "/help" shows an overlay over the messages area rather than adding an
  // entry to the transcript — closed by its own X button or, more usually,
  // implicitly by sending the next message (see the top of `send()`).
  const [helpOpen, setHelpOpen] = useState(false);
  // Backend-driven, independent of this component's mount lifecycle (see
  // `run_with_cancellation` in chat.rs and `useGeneratingListener`'s
  // always-mounted top-level subscriber) — this is what lets `sending` come
  // back correctly true if you switch back to a project whose turn kept
  // running while you were looking at a different one. Excludes
  // *autonomous* turns (the model reacting to a finished background
  // sub-agent) — the user isn't waiting on those, so they shouldn't show
  // the Stop button or block a new send.
  const generatingState = useGenerating(sessionId);
  const generating = generatingState.active && !generatingState.autonomous;

  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const { input, setInput, setInputValue, textareaRef } =
    useChatInput(sessionId);
  const {
    permissionMode,
    setPermissionMode,
    pendingPermission,
    respondPermission,
  } = useSessionPermissions(sessionId, setOllamaError);
  // Initialized from the global (backend-driven) state so a session that's
  // already generating shows correctly on first paint, not just after the
  // sync effect below runs. `send`/`retry`/`stop` still set this directly
  // too, for instant feedback ahead of the round-trip.
  const [sending, setSending] = useState(generating);
  useEffect(() => {
    setSending(generating);
  }, [generating]);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const {
    isAcp,
    isOpenAiCompatible,
    providerActiveId,
    activeAcpAgent,
    acpEffortOptions,
    acpEffortChoice,
    acpCommands,
    model,
    setModel,
    contextLength,
    backendOptions,
    activeBackendKey,
    activeBackendLabel,
    acpModelSwitchPending,
    selectBackendOption,
    selectAcpEffort,
    resetAcpConnectionState,
  } = useChatSession(sessionId, setOllamaError, () => slash.resetDismissed());
  // Gates the Claude session-limit auto-resume banner (see `useChatStream`)
  // — Copilot's ACP wrapper reports errors in its own format, so this stays
  // Claude-only until that's known and worth matching too.
  const isClaudeAcp =
    isAcp && !!activeAcpAgent?.launchCommand.toLowerCase().includes("claude");
  const {
    entries,
    setEntries,
    usage,
    setUsage,
    sessionTitle,
    systemPrompt,
    acpRestoreFailed,
    clearAcpRestoreFailed,
    acpHistoryTruncated,
    claudeRateLimit,
    claudeAutoResumeArmed,
    armClaudeAutoResume,
    dismissClaudeRateLimit,
  } = useChatStream(
    sessionId,
    setOllamaError,
    isClaudeAcp,
    autoResumeFromRateLimit,
  );
  useEffect(() => {
    if (sessionTitle !== null) {
      setConversationTitle(sessionId, sessionTitle);
    }
  }, [sessionId, sessionTitle, setConversationTitle]);

  const { reconnect: reconnectAcp } = useAcpWarmup({
    sessionId,
    isAcp,
    launchCommand: activeAcpAgent?.launchCommand,
    providerActiveId,
    providerConfigFor,
    model,
  });
  const retryAcpSession = () => {
    clearAcpRestoreFailed();
    reconnectAcp();
  };

  const turnDurations = useTurnDurations(
    entries,
    sending,
    generatingState.startedAtMs,
  );
  const replyStartedAt = sending ? generatingState.startedAtMs : null;

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
  const slash = useSlashCommands(input, allCommands);
  // Mirrors `send()`'s own check — a leading space ("!" escaped as " !")
  // means "just send this as text", so it's not shell mode either.
  const shellMode = input.startsWith("!");

  // Runs a local command entirely client-side — never sent to the
  // model/agent as a prompt. Blocked while `sending`, same as `retry`:
  // "/clear"/"/compact" mid-turn would let that turn's own `push_message`
  // calls land right back in the history either just wiped or is about to
  // replace (see `chat::clear_conversation`'s doc comment).
  async function runLocalCommand(name: string) {
    if (sending) return;
    setInputValue("");
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
        // The sidebar's cached title otherwise keeps showing whatever this
        // conversation was called before — the backend already cleared its
        // stored title along with everything else (`db::clear_conversation`
        // deletes the `conversations` row outright), so the frontend's own
        // copy needs to catch up until the next message sets a new one.
        setConversationTitle(sessionId, null);
        if (isAcp) {
          // The backend just dropped its connection to this agent (see
          // `chat::clear_conversation`) — the picker would otherwise keep
          // showing the old, now-disconnected model/effort options as if
          // they were still live. Reconnecting immediately (rather than
          // waiting for the next send) re-announces them fresh.
          resetAcpConnectionState();
          reconnectAcp();
        }
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
    setInputValue("");
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
    setInputValue("");
    setOllamaError(null);
    await submitPrompt(text);
  }

  // The actual "push a user turn and hand it to whichever backend is
  // active" round trip — factored out of `send()` so the Claude
  // session-limit auto-resume (see `useChatStream`'s `claudeRateLimit`) and
  // the message queue can submit the same way, without going through the
  // input box or `send()`'s own guards (those are about whether the *user*
  // is allowed to send right now, not this).
  async function submitPrompt(text: string) {
    markConversationStarted(sessionId, projectRoot, pendingWorktree);
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
      const title = await api.getConversationTitle(sessionId);
      setConversationTitle(sessionId, title);
    } catch (e) {
      setOllamaError(String(e));
      setSending(false);
    }
  }

  const queue = useMessageQueue(sending, submitPrompt);

  // Appends the current input to the back of the queue, delivered in order
  // through the normal `submitPrompt` path as the turn ahead of it finishes.
  function queueMessage() {
    const text = input.trim();
    if (!text) return;
    queue.enqueue(text);
    setInputValue("");
  }

  function autoResumeFromRateLimit() {
    if (!isClaudeAcp || sending) return;
    setOllamaError(null);
    submitPrompt("continue working");
  }

  function acceptSlashCommand(cmd: AcpCommandInfo) {
    setInputValue(`/${cmd.name} `);
    slash.resetDismissed();
    textareaRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slash.showPopover) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        slash.moveDown();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        slash.moveUp();
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        acceptSlashCommand(slash.matches[slash.activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        slash.dismiss();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (sending && (e.ctrlKey || e.metaKey)) {
        queueMessage();
        return;
      }
      send();
    }
  }

  async function stop() {
    // An explicit stop means "I don't want this to keep going" — queued
    // messages auto-firing right after would contradict that, so drop them
    // all too.
    queue.clear();
    await api.cancelPrompt(sessionId);
    setSending(false);
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
  const usageContextLength = usage?.contextLength ?? contextLength;

  const inputBar = (
    <div className={cn("w-full", !isNewThread && "absolute bottom-0")}>
      <div className="mx-auto max-w-4xl">
        <ChatBanners
          helpOpen={helpOpen}
          commands={allCommands}
          onCloseHelp={() => setHelpOpen(false)}
          claudeRateLimit={claudeRateLimit}
          claudeAutoResumeArmed={claudeAutoResumeArmed}
          onArmAutoResume={armClaudeAutoResume}
          onDismissRateLimit={dismissClaudeRateLimit}
          queuedMessages={queue.queued}
          onCancelQueued={queue.remove}
        />
        <ChatInputBar
          input={input}
          onChange={setInput}
          onKeyDown={onKeyDown}
          textareaRef={textareaRef}
          shellMode={shellMode}
          pendingPermission={pendingPermission}
          onRespondPermission={respondPermission}
          showSlashPopover={slash.showPopover}
          slashMatches={slash.matches}
          slashActiveIndex={slash.activeIndex}
          onAcceptSlash={acceptSlashCommand}
          onSlashActiveIndexChange={slash.setActiveIndex}
          sending={sending}
          onSend={send}
          onStop={stop}
          onQueue={queueMessage}
          sendDisabled={
            !input.trim() || (!isAcp && !model) || (isAcp && !activeAcpAgent)
          }
          toolbarLeft={
            <ChatToolbar
              backendOptions={backendOptions}
              activeBackendKey={activeBackendKey}
              activeBackendLabel={activeBackendLabel}
              onSelectBackend={selectBackendOption}
              modelSwitchPending={acpModelSwitchPending}
              modelPickerOpen={modelPickerOpen}
              onModelPickerOpenChange={setModelPickerOpen}
              isAcp={isAcp}
              effortOptions={acpEffortOptions}
              effortChoice={acpEffortChoice}
              onSelectEffort={selectAcpEffort}
              permissionMode={permissionMode}
              onSelectPermissionMode={setPermissionMode}
              showModelIdInput={isOpenAiCompatible && !isAcp}
              model={model}
              onModelChange={setModel}
            />
          }
          contextUsage={
            usedTokens !== null && (
              <ContextUsageRing
                usedTokens={usedTokens}
                contextLength={usageContextLength}
              />
            )
          }
        />
        <CheckoutBar
          sessionId={sessionId}
          projectRoot={projectRoot}
          cwd={worktreeCwd}
          editable={isNewThread}
          onWorktreeSelected={(worktreePath) => {
            // Only reachable while `editable` (a still-new thread) — the
            // worktree is fixed for the rest of the conversation's life once
            // it's started (see `CheckoutBarProps.editable`'s doc comment).
            setPendingWorktree(worktreePath);
            setConversationCheckoutPath(sessionId, worktreePath ?? projectRoot);
            // `warmAcpSession` may have already connected against the primary
            // checkout before this worktree was picked — re-trigger it now
            // that `set_conversation_root` (called by `CheckoutBar` itself) has
            // updated this session's cwd, same retry path a resume failure
            // uses.
            reconnectAcp();
          }}
        />
      </div>
    </div>
  );

  // No message sent yet — centered input instead of the bottom-pinned
  // layout below. Flips the instant `submitPrompt` calls
  // `markConversationStarted`, with no remount.
  if (isNewThread) {
    return <NewThreadView projectName={projectName}>{inputBar}</NewThreadView>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        <ChatEntryList
          entries={entries}
          ollamaError={ollamaError}
          acpRestoreFailed={acpRestoreFailed}
          onRetryAcpSession={retryAcpSession}
          acpHistoryTruncated={acpHistoryTruncated}
          acpAgentLabel={activeAcpAgent?.label}
          systemPrompt={systemPrompt}
          sending={sending}
          isAcp={isAcp}
          turnDurations={turnDurations}
          replyStartedAt={replyStartedAt}
          onRetry={retry}
          className="pb-44 justify-end"
          scrollButtonClassName="bottom-48"
        />
      </div>
      {inputBar}
    </div>
  );
}
