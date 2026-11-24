import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { ChevronDown, ChevronUp, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type SubAgentTask, useSubAgents } from "../../../../data/subAgents";
import { formatDuration } from "../../../../lib/format";
import { api } from "../../../../lib/tauriApi";
import { useAppStore } from "../../../../store";

// How long a finished sub-agent stays in the pill, as "done", before it's
// dropped.
const DONE_LINGER_MS = 5000;

// Failures only count if they happened while the app was open — a failure
// from a previous run isn't news, the Sub agents tab still lists it.
const APP_STARTED_AT = Date.now();

// Failures the user dismissed, kept across conversation switches (the pill
// remounts per conversation) for as long as the app runs.
const dismissedFailures = new Set<string>();

const STATUS_DOT = {
  running: { variant: "accent", label: "Running" },
  done: { variant: "success", label: "Done" },
  error: { variant: "error", label: "Failed" },
} as const;

function plural(n: number, what: string) {
  return `${n} ${what}${n === 1 ? "" : "s"}`;
}

function elapsedMs(task: SubAgentTask, now: number) {
  return (
    (task.status === "running" ? now : (task.endedAt ?? now)) - task.startedAt
  );
}

// The pill docked above the composer while this chat's sub-agents run (#26):
// a spinner, "N sub-agents running" and the longest one's elapsed time.
// Opening it lists each one — label, model, status, elapsed — and a row opens
// its transcript. A finished one shows as done for a few seconds, then drops;
// a failed one stays until dismissed. Reads the same lifecycle-driven query
// as the Sub agents tab (`useSubAgents`), so native and ACP chats both work
// and nothing polls; the 1s tick only advances the elapsed times.
export default function SubAgentsPill({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const tasks = useSubAgents(sessionId);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const [isOpen, setIsOpen] = useState(false);
  const [, setDismissedCount] = useState(0);
  const [now, setNow] = useState(Date.now());

  const visible = tasks
    .filter((t) => {
      if (t.status === "running") return true;
      const ended = t.endedAt ?? 0;
      // Against the live clock, not the last tick: when the refetch that
      // marks one done lands, `now` may be stale by up to the idle gap.
      if (t.status === "done") return Date.now() - ended < DONE_LINGER_MS;
      return ended >= APP_STARTED_AT && !dismissedFailures.has(t.subSessionId);
    })
    .sort((a, b) => a.startedAt - b.startedAt);

  const running = visible.filter((t) => t.status === "running");
  const failed = visible.filter((t) => t.status === "error");
  const lingering = visible.some((t) => t.status === "done");

  // Tick while something's elapsed time is moving or a "done" row is waiting
  // to drop; otherwise nothing changes until the next lifecycle event.
  const isTicking = running.length > 0 || lingering;
  useEffect(() => {
    if (!isTicking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isTicking]);

  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    dismissedFailures.add(id);
    setDismissedCount((n) => n + 1);
  };
  const open = (task: SubAgentTask) => {
    openPanelTab("subagents");
    openChatTab(task.subSessionId, task.description);
  };

  const longest = Math.max(0, ...running.map((t) => elapsedMs(t, now)));
  const summary =
    running.length > 0
      ? `${plural(running.length, "sub-agent")} running · ${formatDuration(longest / 1000)}`
      : failed.length > 0
        ? `${plural(failed.length, "sub-agent")} failed`
        : "Sub-agent done";
  const leading =
    running.length > 0 ? (
      <Spinner size="sm" aria-label="Running" />
    ) : (
      <StatusDot
        variant={failed.length > 0 ? "error" : "success"}
        label={failed.length > 0 ? "Failed" : "Done"}
      />
    );

  const toggle = (
    <Button
      label={isOpen ? "Hide sub-agents" : "Show sub-agents"}
      variant="ghost"
      size="sm"
      icon={leading}
      endContent={<Icon icon={isOpen ? ChevronDown : ChevronUp} size="sm" />}
      onClick={() => setIsOpen((v) => !v)}
    >
      {summary}
    </Button>
  );

  if (!isOpen) return <HStack hAlign="start">{toggle}</HStack>;

  return (
    <Card variant="muted" padding={0}>
      <VStack gap={0}>
        <HStack
          hAlign="between"
          vAlign="center"
          paddingInline={1}
          paddingBlock={1}
        >
          {toggle}
          {running.length > 1 && (
            <Button
              label="Stop all"
              variant="ghost"
              size="sm"
              icon={<Icon icon={Square} size="sm" />}
              onClick={() => {
                for (const t of running) void api.cancelPrompt(t.subSessionId);
              }}
            />
          )}
        </HStack>
        <List density="compact" edge="padded">
          {visible.map((task) => {
            const dot = STATUS_DOT[task.status];
            return (
              <ListItem
                key={task.subSessionId}
                onClick={() => open(task)}
                label={task.description}
                description={`${task.model}${task.effort ? ` (${task.effort})` : ""} · ${dot.label.toLowerCase()}`}
                startContent={
                  <StatusDot
                    variant={dot.variant}
                    label={dot.label}
                    isPulsing={task.status === "running"}
                  />
                }
                endContent={
                  <HStack gap={1} vAlign="center">
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatDuration(elapsedMs(task, now) / 1000)}
                    </Text>
                    {task.status === "running" && (
                      <IconButton
                        variant="ghost"
                        size="sm"
                        label="Stop sub-agent"
                        tooltip="Stop sub-agent"
                        icon={<Icon icon={Square} size="sm" />}
                        onClick={() => void api.cancelPrompt(task.subSessionId)}
                      />
                    )}
                    {task.status === "error" && (
                      <IconButton
                        variant="ghost"
                        size="sm"
                        label="Dismiss"
                        tooltip="Dismiss"
                        icon={<Icon icon={X} size="sm" />}
                        onClick={() => dismiss(task.subSessionId)}
                      />
                    )}
                  </HStack>
                }
              />
            );
          })}
        </List>
      </VStack>
    </Card>
  );
}
