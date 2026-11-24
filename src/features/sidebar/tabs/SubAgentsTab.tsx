import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Bot, ExternalLink, Square, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { type SubAgentTask, useSubAgentsQuery } from "@/data/subAgents";
import { formatDuration, formatTime } from "@/lib/format";
import { api } from "../../../lib/tauriApi";
import { useAppStore } from "../../../store";
import {
  PanelEmptyState,
  PanelErrorState,
  SkeletonRows,
} from "./PanelListState";

const STATUS_DOT = {
  running: { variant: "accent", label: "Running" },
  done: { variant: "success", label: "Finished" },
  error: { variant: "error", label: "Failed" },
} as const;

function SubAgentDot({ status }: { status: SubAgentTask["status"] }) {
  const dot = STATUS_DOT[status];
  return (
    <StatusDot
      variant={dot.variant}
      label={dot.label}
      tooltip={dot.label}
      isPulsing={status === "running"}
    />
  );
}

// The side panel's Sub agents tab: the active conversation's sub-agents as
// compact rows (`List` in a zero-padding section, the List owns the inset).
export default function SubAgentsTab() {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const { tasks, isLoading, error, refetch } =
    useSubAgentsQuery(activeSessionId);
  const openChatTab = useAppStore((s) => s.openChatTab);
  const deleteSubAgentTask = useAppStore((s) => s.deleteSubAgentTask);

  // Ticks once a second so a running task's "running for" duration keeps
  // advancing — only while something is actually running, since otherwise
  // every finished duration is fixed and nothing needs to re-render.
  const hasRunning = tasks.some((t) => t.status === "running");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  if (isLoading) return <SkeletonRows />;
  if (error && tasks.length === 0) {
    return (
      <PanelErrorState
        title="Couldn't load sub-agents"
        error={error}
        onRetry={() => void refetch()}
      />
    );
  }
  if (tasks.length === 0) {
    return (
      <PanelEmptyState
        icon={Bot}
        title="No sub-agents yet"
        description="When the agent hands work to a sub-agent with spawn_sub_agent, it shows up here."
      />
    );
  }

  const sorted = [...tasks].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <List density="compact" hasDividers edge="padded">
      {sorted.map((task) => {
        const running = task.status === "running";
        const duration = formatDuration(
          ((running ? now : (task.endedAt ?? now)) - task.startedAt) / 1000,
        );
        const open = () => openChatTab(task.subSessionId, task.description);
        return (
          <ListItem
            key={task.subSessionId}
            onClick={open}
            startContent={<SubAgentDot status={task.status} />}
            label={task.description}
            description={`${task.model}${task.effort ? ` (${task.effort})` : ""} · started ${formatTime(task.startedAt)}`}
            endContent={
              <HStack gap={1} vAlign="center">
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {duration}
                </Text>
                {running ? (
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label="Stop sub-agent"
                    tooltip="Stop sub-agent"
                    icon={<Icon icon={Square} size="sm" />}
                    onClick={() => void api.cancelPrompt(task.subSessionId)}
                  />
                ) : (
                  <MoreMenu
                    size="sm"
                    label="Sub-agent options"
                    items={[
                      {
                        label: "Open its conversation",
                        icon: <Icon icon={ExternalLink} size="sm" />,
                        onClick: open,
                      },
                      { type: "divider" },
                      {
                        label: "Delete",
                        icon: <Icon icon={Trash2} size="sm" />,
                        variant: "destructive",
                        onClick: () =>
                          activeSessionId &&
                          deleteSubAgentTask(
                            activeSessionId,
                            task.subSessionId,
                          ),
                      },
                    ]}
                  />
                )}
              </HStack>
            }
          />
        );
      })}
    </List>
  );
}
