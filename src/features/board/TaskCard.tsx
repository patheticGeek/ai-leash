import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import {
  borderVars,
  colorVars,
  radiusVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as stylex from "@stylexjs/stylex";
import { MessageSquare, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { STATUS_LABELS, TASK_STATUSES } from "../../data/board";
import { formatDuration } from "../../lib/format";
import { useGenerating } from "../../lib/generatingQuery";
import type { Epic, Task, TaskStatus } from "../../lib/tauriApi";
import { EpicToken, PriorityBadge } from "./TaskMeta";

const styles = stylex.create({
  // The kanban-board template's card: grab cursor, lifts on hover.
  card: {
    cursor: "grab",
    userSelect: "none",
    touchAction: "none",
    transition: "box-shadow 120ms ease",
    ":hover": { boxShadow: "var(--shadow-med)" },
  },
  sortable: (
    transform: string | undefined,
    transition: string | undefined,
  ) => ({
    transform: transform ?? null,
    transition: transition ?? null,
  }),
  // The card being carried leaves the template's ghost behind: muted fill,
  // container radius, and (inside a muted column) a dashed edge for contrast.
  ghost: {
    cursor: "grabbing",
    boxShadow: "none",
    backgroundColor: colorVars["--color-background-muted"],
    borderRadius: radiusVars["--radius-container"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "dashed",
    borderColor: colorVars["--color-border-emphasized"],
  },
  hidden: { visibility: "hidden" },
  // The floating clone under the pointer (`DragOverlay`).
  floating: { cursor: "grabbing" },
});

// Ticks once a second while the task's chat has a turn running.
function Elapsed({ startedAtMs }: { startedAtMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <Text type="supporting" color="secondary" hasTabularNumbers>
      {formatDuration((now - startedAtMs) / 1000)}
    </Text>
  );
}

export interface TaskCardHandlers {
  onOpen: (task: Task) => void;
  onStart: (task: Task) => void;
  onOpenChat: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}

// The card's live state, bottom-end: elapsed + a pulsing dot while its chat
// is working, the open-chat button once it has a chat, else Start.
function CardAction({
  task,
  handlers,
}: {
  task: Task;
  handlers?: TaskCardHandlers;
}) {
  const { active: generating, startedAtMs } = useGenerating(
    task.conversationId ?? "",
  );
  const startable = !task.conversationId && task.status !== "done";
  return (
    <HStack gap={1.5} vAlign="center">
      {generating && (
        <>
          {startedAtMs != null && <Elapsed startedAtMs={startedAtMs} />}
          <StatusDot variant="accent" isPulsing label="Its chat is working" />
        </>
      )}
      {task.conversationId && (
        <IconButton
          variant="ghost"
          size="sm"
          label="Open its chat"
          tooltip="Open its chat"
          icon={<Icon icon={MessageSquare} size="sm" />}
          onClick={() => handlers?.onOpenChat(task)}
        />
      )}
      {startable && (
        <Button
          variant="ghost"
          size="sm"
          label="Start"
          tooltip="Give it a chat (and worktree) and get going"
          icon={<Icon icon={Play} size="sm" />}
          onClick={() => handlers?.onStart(task)}
        />
      )}
    </HStack>
  );
}

// What a card shows, without any drag behaviour — also the drag overlay.
// `handlers` is left out for the overlay, whose buttons are never pressed.
export function TaskCardBody({
  task,
  epic,
  showEpic,
  handlers,
}: {
  task: Task;
  epic: Epic | undefined;
  // Off in epic swimlanes, where the lane already names it.
  showEpic: boolean;
  handlers?: TaskCardHandlers;
}) {
  return (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="center">
        <HStack gap={2} vAlign="center">
          <Text type="supporting" color="secondary" hasTabularNumbers>
            #{task.number}
            {task.effort ? ` · ${task.effort.toUpperCase()}` : ""}
          </Text>
          <PriorityBadge priority={task.priority} />
        </HStack>
        <MoreMenu
          label="Task actions"
          size="sm"
          alignment="end"
          items={[
            { label: "Open", onClick: () => handlers?.onOpen(task) },
            ...(task.conversationId
              ? [
                  {
                    label: "Open its chat",
                    onClick: () => handlers?.onOpenChat(task),
                  },
                ]
              : []),
            { type: "divider" as const },
            ...TASK_STATUSES.filter((s) => s !== task.status).map((s) => ({
              label: `Move to ${STATUS_LABELS[s]}`,
              onClick: () => handlers?.onMove(task, s),
            })),
          ]}
        />
      </HStack>
      <Heading level={4} accessibilityLevel={3} maxLines={2}>
        {task.title}
      </Heading>
      <HStack hAlign="between" vAlign="center" gap={2}>
        {showEpic && epic ? <EpicToken epic={epic} /> : <StackItem />}
        <CardAction task={task} handlers={handlers} />
      </HStack>
    </VStack>
  );
}

// The floating card under the pointer while dragging, on --shadow-high.
export function FloatingTaskCard({
  task,
  epic,
  showEpic,
  width,
}: {
  task: Task;
  epic: Epic | undefined;
  showEpic: boolean;
  width: number;
}) {
  return (
    <Card padding={3} elevation="high" width={width} xstyle={styles.floating}>
      <TaskCardBody task={task} epic={epic} showEpic={showEpic} />
    </Card>
  );
}

// A draggable card. `lane` is the swimlane it sits in (an epic id, "none",
// or "all" when the board isn't grouped) — dropping it in another lane
// changes its epic. Clicking the card (not one of its buttons) opens it.
export default function TaskCard({
  task,
  epic,
  lane,
  showEpic,
  handlers,
}: {
  task: Task;
  epic: Epic | undefined;
  lane: string;
  showEpic: boolean;
  handlers: TaskCardHandlers;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "task", lane, status: task.status },
    });
  const fromButton = (target: EventTarget) =>
    target instanceof Element &&
    target.closest("button, a, [role='menu'], [role='menuitem']") !== null;
  return (
    <Card
      ref={setNodeRef}
      padding={3}
      tabIndex={0}
      aria-label={`#${task.number}: ${task.title}`}
      xstyle={[
        styles.card,
        styles.sortable(CSS.Translate.toString(transform), transition),
        isDragging && styles.ghost,
      ]}
      {...listeners}
      onClick={(e) => {
        if (!fromButton(e.target)) handlers.onOpen(task);
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === "Enter") {
          e.preventDefault();
          handlers.onOpen(task);
        }
      }}
    >
      <VStack xstyle={isDragging && styles.hidden}>
        <TaskCardBody
          task={task}
          epic={epic}
          showEpic={showEpic}
          handlers={handlers}
        />
      </VStack>
    </Card>
  );
}
