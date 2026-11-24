import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
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

const styles = stylex.create({
  fill: { height: "100%", minHeight: 0 },
  transcript: { flex: 1, minHeight: 0 },
});

const STATUS = {
  running: { variant: "accent", label: "Running" },
  done: { variant: "success", label: "Finished" },
  error: { variant: "error", label: "Failed" },
} as const;

// Shows a sub-agent's own transcript through the same `ChatEntryList`/
// `ChatEntryRenderer` a top-level conversation uses — tool calls and
// thinking blocks render identically (collapsible, same icons/labels), just
// with `allowRetry`/the system prompt turned off, since a sub-agent has no
// `retry_last`/system-prompt concept of its own. Above it, a one-line header:
// status dot, what it was asked, model.
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
  const dot = STATUS[task?.status ?? "done"];
  return (
    <VStack xstyle={styles.fill}>
      <HStack gap={2} vAlign="center" paddingInline={3} paddingBlock={2}>
        <StatusDot
          variant={dot.variant}
          label={dot.label}
          tooltip={dot.label}
          isPulsing={running}
        />
        <Text type="supporting" maxLines={1}>
          {task?.description}
        </Text>
        {task?.model && (
          <Text type="supporting" color="secondary" maxLines={1}>
            {task.model}
            {task.effort ? ` (${task.effort})` : ""}
          </Text>
        )}
      </HStack>
      <VStack xstyle={styles.transcript}>
        <ChatEntryList
          entries={entries}
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
          isCompact
          turnDurations={{}}
          replyStartedAt={task?.startedAt ?? null}
        />
      </VStack>
    </VStack>
  );
}
