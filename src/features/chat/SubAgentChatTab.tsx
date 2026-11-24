import { ChatSystemMessage } from "@astryxdesign/core/Chat";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import { useSubAgents } from "../../data/subAgents";
import {
  messagesToEntries,
  reconcileWithPersisted,
} from "../../lib/chatEntries";
import { api } from "../../lib/tauriApi";
import { useAppStore } from "../../store";
import ChatEntryList from "./components/messages/ChatEntryList";
import { useTurnDurations } from "./hooks/useTurnDurations";

const styles = stylex.create({
  fill: { height: "100%", minHeight: 0 },
});

const STATUS = {
  running: { variant: "accent", label: "Running" },
  done: { variant: "success", label: "Finished" },
  error: { variant: "error", label: "Failed" },
} as const;

// A sub-agent's own transcript: the very `ChatEntryList` a top-level
// conversation's `ChatPanel` renders, with the same props and density, so
// it looks and behaves exactly like the main chat minus the composer
// (grouping, metadata rows, fades, scroll-to-bottom, opening at the end,
// following new output, empty / loading / error states). Only Retry is off,
// since a sub-agent can't re-run a turn. Its status and model are a system
// line at the top, where the main chat's system prompt line goes; what it
// was asked is its tab's title and its first message.
export default function SubAgentChatTab({
  subSessionId,
}: {
  subSessionId: string;
}) {
  const entries = useAppStore((s) => s.subAgentThreads[subSessionId]) ?? [];
  const setSubAgentEntries = useAppStore((s) => s.setSubAgentEntries);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const task = useSubAgents(activeSessionId).find(
    (t) => t.subSessionId === subSessionId,
  );

  // The persisted transcript is the source of truth for what a sub-agent was
  // asked to do (its opening user message is written by the backend before
  // it runs, and never streamed as an event), so always reconcile with it on
  // mount rather than only when nothing else has populated the store yet —
  // a live thread built purely from stream events would otherwise lack it,
  // and a tab reopened after an app restart has nothing else to show at all.
  // Also re-run whenever its status changes: a sub-agent that fails or
  // finishes without a reply gets its outcome written as a final message
  // (`chat::run_sub_agent`/`acp::run_sub_agent_acp`) that's persisted but
  // never streamed, so an already-open tab would otherwise never show it.
  // `status` comes from the lifecycle-driven `useSubAgents` query, so the
  // transition can't be missed the way a per-sub-agent stream event can.
  const status = task?.status;
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is trigger-only — bumping it re-runs the load for the transcript's Try again
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api
      .loadConversationHistory(subSessionId)
      .then((messages) => {
        if (cancelled) return;
        const persisted = messagesToEntries(messages);
        // Once it's finished, disk has the whole transcript (including that
        // final message), so it replaces the live copy outright; while it's
        // still running, live events are ahead of disk and win.
        setSubAgentEntries(subSessionId, (prev) =>
          status === "done" || status === "error"
            ? persisted
            : reconcileWithPersisted(prev, persisted),
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [subSessionId, setSubAgentEntries, status, attempt]);

  const running = status === "running";
  // "Worked for" times the way `ChatPanel` keeps them: from disk for
  // finished turns, frozen from the run's start when it finishes live.
  const turnDurations = useTurnDurations(
    entries,
    running,
    running ? (task?.startedAt ?? null) : null,
  );
  const dot = STATUS[task?.status ?? "done"];
  const model = task?.model
    ? `${task.model}${task.effort ? ` (${task.effort})` : ""}`
    : null;
  return (
    <VStack xstyle={styles.fill}>
      <ChatEntryList
        entries={entries}
        leading={
          <ChatSystemMessage
            icon={
              <StatusDot
                variant={dot.variant}
                label={dot.label}
                isPulsing={running}
              />
            }
          >
            {["Sub-agent", model, dot.label].filter(Boolean).join(" · ")}
          </ChatSystemMessage>
        }
        // Live events can fill a running sub-agent's thread before its
        // saved transcript loads; only an empty one waits on the load.
        historyLoaded={loaded || entries.length > 0}
        historyError={entries.length > 0 ? null : loadError}
        onReloadHistory={() => {
          setLoaded(false);
          setAttempt((n) => n + 1);
        }}
        sending={running}
        allowRetry={false}
        turnDurations={turnDurations}
        replyStartedAt={running ? (task?.startedAt ?? null) : null}
      />
    </VStack>
  );
}
