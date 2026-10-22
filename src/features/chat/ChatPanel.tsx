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
// conversation switch — `TabContentHost`'s `viewEpoch` key) so the transcript's first
// paint already leaves the right room for it, instead of starting at 0 and
// shifting the messages once it's measured.
let lastComposerHeight = 0;

export default function ChatPanel({
  sessionId,
  projectRoot,
  compact = false,
}: {
  sessionId: string | null;
  projectRoot: string;
  // A slim chat for a narrow column — the board's project chat: fills its
  // column instead of a centered max width, and has no checkout bar (it
  // always works in the project's main checkout).
  compact?: boolean;
}) {
  const conversations = useConversations();
  const promoteDraft = useAppStore((s) => s.promoteDraft);
  const setDraftWorktree = useAppStore((s) => s.setDraftWorktree);
  const draftWorktree = useAppStore((s) => s.draft?.worktreePath ?? null);
  const setConversationTitle = useAppStore((s) => s.setConversationTitle);
  const clearSubAgentTasksForParent = useAppStore(
    (s) => s.clearSubAgentTasksForParent,
  );
  // No id yet: a new thread that has never had a message sent — the
  // centered layout below, rather than the normal bottom-pinned one. Flips
  // (without a remount — `TabContentHost` keys it on `viewEpoch`, not the id)
  // the instant `submitPrompt` calls `promoteDraft`.
  const isNewThread = sessionId === null;
  const conversation = conversations.find((c) => c.id === sessionId);
  // The worktree a new thread has picked via `CheckoutBar` (`null` is the
  // primary checkout), else the conversation's own — fixed for the rest of
  // its life once it has started.
  const worktreeCwd = isNewThread
    ? (draftWorktree ?? projectRoot)
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
  const generatingState = useGenerating(sessionId ?? "");
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
    whenListening,
  } = useChatStream(sessionId, setChatError);
  useEffect(() => {
    if (sessionId && sessionTitle !== null) {
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
    // A new thread has nothing to clear or compact.
    if (!sessionId) return;
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
    // In a new thread this is its first message too.
    const id = sessionId ?? (await startConversation());
    if (!id) return;
    setSending(true);
    try {
      await api.runShellCommand(id, command);
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
    const id = sessionId ?? (await startConversation(text));
    if (!id) return;
    if (sessionId) {
      setEntries((prev) => [
        ...prev,
        { kind: "text", role: "user", content: text, time: Date.now() },
      ]);
      setSending(true);
    }
    try {
      await backend.send(id, text);
      const title = await api.getConversationTitle(id);
      setConversationTitle(id, title);
    } catch (e) {
      setChatError(String(e));
      setSending(false);
    }
  }

  // A new thread's first message: this is where it gets an id and becomes a
  // real conversation (`promoteDraft`), with the checkout it picked locked
  // in on the backend before anything can run in it. `text` (a prompt, not
  // a shell escape) shows straight away while that happens. Resolves to the
  // new id once its stream listeners are up, or null if that failed.
  async function startConversation(text?: string): Promise<string | null> {
    const cwd = worktreeCwd;
    const id = promoteDraft();
    if (!id) return null;
    if (text !== undefined) {
      setEntries((prev) => [
        ...prev,
        { kind: "text", role: "user", content: text, time: Date.now() },
      ]);
      setSending(true);
    }
    try {
      await api.setConversationRoot(id, projectRoot, cwd);
      await whenListening(id);
      return id;
    } catch (e) {
      setChatError(String(e));
      setSending(false);
      return null;
    }
  }

  async function stop() {
    if (!sessionId) return;
    await api.cancelPrompt(sessionId);
    setSending(false);
  }

  async function retry() {
    if (!sessionId || sending || !backend.caps.retry || !backend.ready) return;
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
              className={cn("justify-end", compact && "mx-0 max-w-none")}
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
          compact={compact}
          checkout={{
            projectRoot,
            cwd: worktreeCwd,
            editable: isNewThread,
            // Only reachable while `editable` (a new thread) — the worktree
            // is fixed for the rest of the conversation's life once it's
            // started (see `CheckoutBarProps.editable`'s doc comment).
            // Nothing has connected yet, so there's nothing to redo.
            onWorktreeSelected: setDraftWorktree,
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
