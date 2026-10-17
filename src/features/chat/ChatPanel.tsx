import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useConversations } from "../../data/conversations";
import { useGenerating } from "../../lib/generatingQuery";
import { api } from "../../lib/tauriApi";
import { useAppStore } from "../../store";
import ChatComposer from "./components/composer/ChatComposer";
import NewThreadHero from "./components/empty-states/NewThreadHero";
import ChatEntryList from "./components/messages/ChatEntryList";
import { useBackendWarmup } from "./hooks/useBackendWarmup";
import { useChatSession } from "./hooks/useChatSession";
import { useChatStream } from "./hooks/useChatStream";
import { useTurnDurations } from "./hooks/useTurnDurations";

// The composer's last measured height, carried across remounts (one per
// conversation switch — `CenterPanel`'s `key`) so the transcript's first
// paint already leaves the right room for it, instead of starting at 0 and
// shifting the messages once it's measured.
let lastComposerHeight = 0;

export default function ChatPanel({
  sessionId,
  projectRoot,
}: {
  sessionId: string;
  projectRoot: string;
}) {
  const conversations = useConversations();
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

  const [chatError, setChatError] = useState<string | null>(null);
  // The composer floats over the bottom of the transcript; this is how much
  // room the transcript leaves for it (see `ChatComposer`'s `onHeightChange`).
  const [composerHeight, setComposerHeightState] = useState(lastComposerHeight);
  const setComposerHeight = useCallback((height: number) => {
    lastComposerHeight = height;
    setComposerHeightState(height);
  }, []);
  // Initialized from the global (backend-driven) state so a session that's
  // already generating shows correctly on first paint, not just after the
  // sync effect below runs. `submitPrompt`/`retry`/`stop` still set this
  // directly too, for instant feedback ahead of the round-trip.
  const [sending, setSending] = useState(generating);
  useEffect(() => {
    setSending(generating);
  }, [generating]);

  const session = useChatSession(sessionId, setChatError);
  const { backend, backendConfig } = session;
  const {
    entries,
    setEntries,
    historyLoaded,
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
  } = useChatStream(sessionId, setChatError);
  useEffect(() => {
    if (sessionTitle !== null) {
      setConversationTitle(sessionId, sessionTitle);
    }
  }, [sessionId, sessionTitle, setConversationTitle]);

  const { reconnect } = useBackendWarmup(sessionId, backend);
  const retryAcpSession = () => {
    clearAcpRestoreFailed();
    reconnect();
  };

  const turnDurations = useTurnDurations(
    entries,
    sending,
    generatingState.startedAtMs,
  );
  const replyStartedAt = sending ? generatingState.startedAtMs : null;

  // "/clear" and "/compact" — the composer decided the user typed one (and
  // that it's allowed right now); this is what they do to the conversation.
  async function runCommand(name: string) {
    if (name === "clear") {
      setChatError(null);
      try {
        await api.clearConversation(sessionId);
        setEntries([]);
        setUsage(null);
        // The backend also deletes any sub-agent this conversation spawned
        // (see `db::clear_conversation`) — drop them from local state too,
        // so the Sub Agents sidebar and any open sub-agent tab don't keep
        // pointing at now-deleted rows.
        clearSubAgentTasksForParent(sessionId);
        // The conversation stays listed, but the backend reset its title
        // (`db::clear_conversation`) so the next message derives a new one —
        // clear the cached copy now rather than waiting for the refetch.
        setConversationTitle(sessionId, null);
        if (backend.caps.warmup) {
          // The backend just dropped its connection (see
          // `chat::clear_conversation`); reconnect now rather than on the
          // next send, so the picker's options come back straight away.
          reconnect();
        }
      } catch (e) {
        setChatError(String(e));
      }
      return;
    }
    if (name === "compact") {
      if (!backend.caps.compaction || !backend.ready) return;
      setChatError(null);
      setSending(true);
      try {
        const summary = await backend.compact(sessionId);
        setEntries([
          {
            kind: "info",
            content: `Conversation compacted:\n\n${summary}`,
            time: Date.now(),
          },
        ]);
        setUsage(null);
      } catch (e) {
        setChatError(String(e));
      } finally {
        setSending(false);
      }
    }
  }

  // Runs `command` as a shell command right away (no permission prompt:
  // typing "!<command>" *is* the approval) and the result lands in the
  // transcript as a tool call, just with its own backend round trip instead
  // of being purely client-side (see `run_shell_command` in `tools.rs` for
  // why: it still needs to persist a real tool-call/result pair so this
  // survives a reload).
  async function runShellEscape(command: string) {
    setChatError(null);
    setSending(true);
    try {
      await api.runShellCommand(sessionId, command);
    } catch (e) {
      setChatError(String(e));
    } finally {
      setSending(false);
    }
  }

  // The actual "push a user turn and hand it to whichever backend is
  // active" round trip — shared by the composer's send path and message
  // queue. The guards about whether the *user* is allowed to
  // send right now live in the composer, not here.
  async function submitPrompt(text: string) {
    // Also covers a queued message delivered after its backend was turned
    // off — the composer's own `backend.ready` check only gates typed sends.
    if (!backend.ready) return;
    setChatError(null);
    markConversationStarted(sessionId, projectRoot, pendingWorktree);
    setEntries((prev) => [
      ...prev,
      { kind: "text", role: "user", content: text, time: Date.now() },
    ]);
    setSending(true);
    try {
      await backend.send(sessionId, text);
      const title = await api.getConversationTitle(sessionId);
      setConversationTitle(sessionId, title);
    } catch (e) {
      setChatError(String(e));
      setSending(false);
    }
  }

  async function stop() {
    await api.cancelPrompt(sessionId);
    setSending(false);
  }

  async function retry() {
    if (sending || !backend.caps.retry || !backend.ready) return;
    setChatError(null);
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
      await backend.retry(sessionId);
    } catch (e) {
      setChatError(String(e));
      setSending(false);
    }
  }

  // The composer sits at the same place in the tree in both layouts (the
  // wrapper below is `display: contents` once the conversation has started),
  // so it isn't remounted — and its draft/queue state isn't lost — when the
  // first message flips this from the centered "new thread" layout to the
  // bottom-pinned one.
  return (
    <div
      className={cn(
        "flex h-full",
        isNewThread ? "items-center justify-center px-6" : "flex-col",
      )}
    >
      <div className={isNewThread ? "w-full max-w-2xl" : "contents"}>
        {isNewThread ? (
          <NewThreadHero projectName={projectName} />
        ) : (
          <div className="relative flex-1 overflow-hidden">
            <ChatEntryList
              entries={entries}
              chatError={chatError}
              acpRestoreFailed={acpRestoreFailed}
              onRetryAcpSession={retryAcpSession}
              acpHistoryTruncated={acpHistoryTruncated}
              acpAgentLabel={backendConfig?.label}
              systemPrompt={systemPrompt}
              historyLoaded={historyLoaded}
              sending={sending}
              allowRetry={backend.caps.retry}
              turnDurations={turnDurations}
              replyStartedAt={replyStartedAt}
              onRetry={retry}
              className="justify-end"
              bottomInset={composerHeight}
            />
          </div>
        )}
        <ChatComposer
          sessionId={sessionId}
          floating={!isNewThread}
          session={session}
          sending={sending}
          usage={usage}
          claudeRateLimit={{
            rateLimit: claudeRateLimit,
            autoResumeArmed: claudeAutoResumeArmed,
            onArmAutoResume: armClaudeAutoResume,
            onDismiss: dismissClaudeRateLimit,
          }}
          checkout={{
            sessionId,
            projectRoot,
            cwd: worktreeCwd,
            editable: isNewThread,
            onWorktreeSelected: (worktreePath) => {
              // Only reachable while `editable` (a still-new thread) — the
              // worktree is fixed for the rest of the conversation's life
              // once it's started (see `CheckoutBarProps.editable`'s doc
              // comment).
              setPendingWorktree(worktreePath);
              setConversationCheckoutPath(
                sessionId,
                worktreePath ?? projectRoot,
              );
              // `backend.warm` may have already connected against the
              // primary checkout before this worktree was picked —
              // re-trigger it now that `set_conversation_root` (called by
              // `CheckoutBar` itself) has updated this session's cwd, same
              // retry path a resume failure uses.
              reconnect();
            },
          }}
          onSubmit={submitPrompt}
          onRunShell={runShellEscape}
          onCommand={runCommand}
          onStop={stop}
          onError={setChatError}
          onHeightChange={setComposerHeight}
        />
      </div>
    </div>
  );
}
