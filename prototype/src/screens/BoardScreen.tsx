// Project board — the kanban-board template inside the app frame: its
// LayoutHeader (hasDivider, padding 4) + Toolbar, then columns that are muted
// Cards with a Layout header (StatusDot, Heading 4, InfoTip, count; padding 3)
// and a padding-2 body of cards (padding 3, gap 2), gap 4 between columns.
// Group by epic keeps those columns and splits each into lane cells under one
// sticky column-header row; the lane label column is sticky on the inline
// start so it stays pinned while the board scrolls sideways.
import { Fragment, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ChatLayout, ChatMessage, ChatMessageBubble, ChatMessageList, ChatSystemMessage, ChatMessageMetadata } from "@astryxdesign/core/Chat";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { InfoTip } from "@astryxdesign/core/InfoTip";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Markdown } from "@astryxdesign/core/Markdown";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Token } from "@astryxdesign/core/Token";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { borderVars, colorVars, radiusVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import {
  AdjustmentsHorizontalIcon,
  ArchiveBoxIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  InboxIcon,
  PlayIcon,
  PlusIcon,
  RectangleStackIcon,
  ArrowPathIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/outline";
import { ComposerDock, MessageComposer } from "../chat/Composer";
import { COLUMNS, EPICS, PRIORITY_META, TASKS, epicColor, type Status, type Task } from "../data";
import AppFrame from "../shell/AppFrame";
import PaneTabs from "../shell/PaneTabs";
import TitleBar from "../shell/TitleBar";
import Workspace from "../shell/Workspace";

const COLUMN_WIDTH = 260;
const LANE_LABEL_WIDTH = 196; // includes the spacing-4 gutter it carries

const styles = stylex.create({
  boardColumns: {
    flexDirection: "row",
    overflowX: "auto",
    overflowY: "hidden",
    height: "100%",
    padding: spacingVars["--spacing-4"],
  },
  columnShell: { flexShrink: 0, flexBasis: COLUMN_WIDTH, height: "100%" },
  card: { cursor: "grab", userSelect: "none" },
  // The template's ghost (muted fill, container radius). Inside a muted lane
  // cell the fill alone has no contrast, so it also takes a dashed edge.
  ghost: (height: number) => ({
    height,
    borderRadius: radiusVars["--radius-container"],
    backgroundColor: colorVars["--color-background-muted"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "dashed",
    borderColor: colorVars["--color-border-emphasized"],
  }),
  toolbarDivider: { height: "auto", marginBlock: spacingVars["--spacing-1"], alignSelf: "stretch" },
  columnEmptyState: { paddingBlock: spacingVars["--spacing-10"] },
  // Swimlanes: one grid, lane label column + one column per status.
  // No padding on the scroller itself: sticky cells pin to its edge, and
  // carry the spacing-4 gutter inside them so nothing scrolls under a gap.
  swimScroll: { overflow: "auto", height: "100%" },
  swimGrid: (columns: number) => ({
    display: "grid",
    gridTemplateColumns: `${LANE_LABEL_WIDTH}px repeat(${columns}, ${COLUMN_WIDTH}px)`,
    columnGap: spacingVars["--spacing-4"],
    width: "max-content",
    paddingInlineEnd: spacingVars["--spacing-4"],
    paddingBlockEnd: spacingVars["--spacing-4"],
  }),
  stickyTop: {
    position: "sticky",
    insetBlockStart: 0,
    zIndex: 1,
    paddingBlockStart: spacingVars["--spacing-4"],
    backgroundColor: colorVars["--color-background-surface"],
  },
  // A column's cells together read as the template's one muted column Card.
  cell: { backgroundColor: colorVars["--color-background-muted"], minWidth: 0 },
  headCell: {
    borderStartStartRadius: radiusVars["--radius-container"],
    borderStartEndRadius: radiusVars["--radius-container"],
  },
  lastCell: {
    borderEndStartRadius: radiusVars["--radius-container"],
    borderEndEndRadius: radiusVars["--radius-container"],
  },
  corner: {
    position: "sticky",
    insetBlockStart: 0,
    insetInlineStart: 0,
    zIndex: 3,
    backgroundColor: colorVars["--color-background-surface"],
  },
  laneLabel: {
    position: "sticky",
    insetInlineStart: 0,
    zIndex: 2,
    paddingInlineStart: spacingVars["--spacing-4"],
    backgroundColor: colorVars["--color-background-surface"],
  },
  // The template's carried card: fixed, on --shadow-high, under the pointer.
  floating: {
    position: "fixed",
    insetBlockStart: 0,
    insetInlineStart: 0,
    pointerEvents: "none",
    cursor: "grabbing",
    zIndex: 1000,
  },
  floatingAt: (x: number, y: number, width: number) => ({
    width,
    transform: `translate(${x}px, ${y}px)`,
  }),
  chatFill: { height: "100%", minHeight: 0 },
});

const COLUMN_META: Record<Status, { tooltip: string; emptyTitle: string; emptyIcon: typeof InboxIcon }> = {
  backlog: { tooltip: "Ideas and tasks not planned yet.", emptyTitle: "Backlog is empty", emptyIcon: ArchiveBoxIcon },
  todo: { tooltip: "Planned tasks, ready to start.", emptyTitle: "Nothing to do", emptyIcon: InboxIcon },
  in_progress: { tooltip: "Tasks whose chat is working or waiting on you.", emptyTitle: "Nothing in progress", emptyIcon: ArrowPathIcon },
  review: { tooltip: "Finished by the agent, waiting for your review.", emptyTitle: "Nothing in review", emptyIcon: ClipboardDocumentCheckIcon },
  done: { tooltip: "Finished tasks. Older ones load on demand.", emptyTitle: "Nothing done yet", emptyIcon: CheckCircleIcon },
};

const PRIORITY_BADGE = { urgent: "error", high: "orange", medium: "warning", low: "teal" } as const;

function TaskCardBody({ task, showEpic }: { task: Task; showEpic: boolean }) {
  return (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="center">
        <HStack gap={2} vAlign="center">
          <Text type="supporting" color="secondary" hasTabularNumbers>
            #{task.number}
            {task.effort ? ` · ${task.effort}` : ""}
          </Text>
          <Badge label={PRIORITY_META[task.priority].label} variant={PRIORITY_BADGE[task.priority]} />
        </HStack>
        <MoreMenu
          label="Task actions"
          size="sm"
          items={[
            { label: "Open" },
            { label: "Edit" },
            { type: "divider" },
            ...COLUMNS.filter((c) => c.id !== task.status).map((c) => ({ label: `Move to ${c.title}` })),
            { type: "divider" },
            { label: "Delete", variant: "destructive" as const },
          ]}
        />
      </HStack>
      <Heading level={4} accessibilityLevel={3} maxLines={2}>
        {task.title}
      </Heading>
      <HStack hAlign="between" vAlign="center" gap={2}>
        {showEpic && task.epic ? <Token size="sm" label={task.epic} color={epicColor(task.epic)} /> : <StackItem />}
        <TaskCardAction task={task} />
      </HStack>
    </VStack>
  );
}

function TaskCardAction({ task }: { task: Task }) {
  if (task.isWorking) {
    return (
      <HStack gap={1.5} vAlign="center">
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {task.elapsed}
        </Text>
        <StatusDot variant="accent" isPulsing label="Its chat is working" />
      </HStack>
    );
  }
  if (task.hasChat) {
    return (
      <IconButton variant="ghost" size="sm" label="Open its chat" icon={<Icon icon={ChatBubbleLeftRightIcon} size="sm" />} />
    );
  }
  return <Button label="Start" size="sm" variant="ghost" icon={<Icon icon={PlayIcon} size="sm" />} />;
}

function TaskCard({ task, showEpic }: { task: Task; showEpic: boolean }) {
  return (
    <Card padding={3} xstyle={styles.card}>
      <TaskCardBody task={task} showEpic={showEpic} />
    </Card>
  );
}

function ColumnHeader({ status, title, dot, count, hasAdd = true }: { status: Status; title: string; dot: (typeof COLUMNS)[number]["dot"]; count: number; hasAdd?: boolean }) {
  return (
    <HStack hAlign="between" vAlign="center">
      <HStack gap={2} vAlign="center">
        <StatusDot variant={dot} label={`${title} status`} />
        <Heading level={4} accessibilityLevel={2}>
          {title}
        </Heading>
        <InfoTip content={COLUMN_META[status].tooltip} label={`About ${title}`} />
      </HStack>
      <HStack gap={1} vAlign="center">
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {count}
        </Text>
        {hasAdd && <IconButton variant="ghost" size="sm" label={`Add a task to ${title}`} icon={<Icon icon={PlusIcon} size="sm" />} />}
      </HStack>
    </HStack>
  );
}

function BoardColumn({ column, tasks }: { column: (typeof COLUMNS)[number]; tasks: Task[] }) {
  const meta = COLUMN_META[column.id];
  return (
    <Card variant="muted" padding={0} xstyle={styles.columnShell}>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={3}>
            <ColumnHeader status={column.id} title={column.title} dot={column.dot} count={tasks.length} />
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={2}>
            {tasks.length === 0 ? (
              <EmptyState
                isCompact
                xstyle={styles.columnEmptyState}
                icon={<Icon icon={meta.emptyIcon} size="lg" color="secondary" />}
                title={meta.emptyTitle}
              />
            ) : (
              <VStack gap={2}>
                {tasks.map((t) => (
                  <TaskCard key={t.number} task={t} showEpic />
                ))}
                {column.id === "done" && <Button label="Load 12 older" variant="ghost" size="sm" />}
              </VStack>
            )}
          </LayoutContent>
        }
      />
    </Card>
  );
}

function Columns({ columns }: { columns: typeof COLUMNS }) {
  return (
    <HStack gap={4} xstyle={styles.boardColumns}>
      {columns.map((c) => (
        <BoardColumn key={c.id} column={c} tasks={TASKS.filter((t) => t.status === c.id)} />
      ))}
    </HStack>
  );
}

function Swimlanes({ columns, ghostAt, carried }: { columns: typeof COLUMNS; ghostAt?: { epic: string; status: Status }; carried?: number }) {
  const lanes = [...EPICS.map((e) => e.name), null];
  return (
    <VStack xstyle={styles.swimScroll} data-board-scroll>
      <VStack xstyle={styles.swimGrid(columns.length)}>
        <VStack xstyle={styles.corner} />
        {columns.map((c) => (
          <VStack key={c.id} xstyle={styles.stickyTop}>
            <VStack padding={3} xstyle={[styles.cell, styles.headCell]}>
              <ColumnHeader status={c.id} title={c.title} dot={c.dot} count={TASKS.filter((t) => t.status === c.id).length} />
            </VStack>
          </VStack>
        ))}
        {lanes.map((lane, li) => {
          const laneTasks = TASKS.filter((t) => t.epic === lane && t.number !== carried);
          const isLast = li === lanes.length - 1;
          return (
            <Fragment key={lane ?? "none"}>
              <VStack gap={1} hAlign="start" paddingBlock={3} paddingInlineEnd={3} xstyle={styles.laneLabel}>
                {lane ? <Token label={lane} color={epicColor(lane)} /> : <Text weight="semibold">No epic</Text>}
                <Text type="supporting" color="secondary">
                  {laneTasks.length} tasks
                </Text>
              </VStack>
              {columns.map((c) => {
                const cellTasks = laneTasks.filter((t) => t.status === c.id);
                const hasGhost = ghostAt && ghostAt.epic === lane && ghostAt.status === c.id;
                return (
                  <VStack key={c.id} gap={0} xstyle={[styles.cell, isLast && styles.lastCell]}>
                    <Divider />
                    <VStack gap={2} padding={2}>
                      {cellTasks.map((t) => (
                        <TaskCard key={t.number} task={t} showEpic={false} />
                      ))}
                      {hasGhost && <VStack xstyle={styles.ghost(96)} />}
                      {c.id === "done" && isLast && <Button label="Load 12 older" variant="ghost" size="sm" />}
                    </VStack>
                  </VStack>
                );
              })}
            </Fragment>
          );
        })}
      </VStack>
    </VStack>
  );
}

function BoardHeader({ isGrouped, showDone }: { isGrouped: boolean; showDone: boolean }) {
  return (
    <LayoutHeader hasDivider padding={4}>
      <Toolbar
        label="Board actions"
        gap={2}
        startContent={
          <>
            <Heading level={3} accessibilityLevel={1}>
              Tasks
            </Heading>
            <Badge label={TASKS.length} variant="neutral" />
          </>
        }
        endContent={
          <HStack gap={2} wrap="wrap" vAlign="center">
            <Selector
              label="Epic"
              width={200}
              isLabelHidden
              value="all"
              onChange={() => {}}
              options={[{ value: "all", label: "All epics" }, { type: "divider" }, ...EPICS.map((e) => ({ value: e.name, label: e.name }))]}
            />
            <Divider variant="strong" orientation="vertical" xstyle={styles.toolbarDivider} />
            <HStack gap={1} vAlign="center">
              <ToggleButton label="Group by epic" isIconOnly isPressed={isGrouped} icon={<Icon icon={RectangleStackIcon} size="sm" />} />
              <ToggleButton label="Show done" isIconOnly isPressed={showDone} icon={<Icon icon={CheckCircleIcon} size="sm" />} />
              <IconButton variant="ghost" label="Board settings" tooltip="Board settings" icon={<Icon icon={AdjustmentsHorizontalIcon} size="sm" />} />
            </HStack>
            <Button label="New task" variant="primary" icon={<Icon icon={PlusIcon} size="sm" />} />
          </HStack>
        }
      />
    </LayoutHeader>
  );
}

function ProjectChat() {
  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader padding={0}>
          <PaneTabs label="Project chat" tabs={[{ value: "chat", label: "Project chat" }]} value="chat" onChange={() => {}} />
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0} isScrollable={false}>
          <ChatLayout
            density="compact"
            xstyle={styles.chatFill}
            composer={<ComposerDock box={<MessageComposer placeholder="Plan with the agent…" isCompact />} />}
          >
            <ChatMessageList>
              <ChatSystemMessage variant="divider">Today</ChatSystemMessage>
              <ChatMessage sender="user">
                <ChatMessageBubble metadata={<ChatMessageMetadata timestamp={<Timestamp value="2026-11-23T09:30:00" format="time" />} />}>
                  Plan the Astryx board work as tasks. Start #42 now.
                </ChatMessageBubble>
              </ChatMessage>
              <ChatMessage sender="assistant">
                <ChatMessageBubble variant="ghost">
                  <Markdown density="compact">{`Added **#42–#45** to the board under *Astryx migration* and started **#42** with Claude Code in worktree \`task-42\`.`}</Markdown>
                </ChatMessageBubble>
              </ChatMessage>
              <ChatMessage sender="user">
                <ChatMessageBubble
                  name={<Text type="supporting" color="secondary">From #42</Text>}
                  metadata={<ChatMessageMetadata timestamp={<Timestamp value="2026-11-23T10:07:00" format="time" />} />}
                >
                  Columns done. Working on the epic swimlanes next.
                </ChatMessageBubble>
              </ChatMessage>
            </ChatMessageList>
          </ChatLayout>
        </LayoutContent>
      }
    />
  );
}

export type BoardVariant = "both" | "board" | "epics" | "epics-scrolled";

export default function BoardScreen({ variant = "both" }: { variant?: BoardVariant }) {
  const isGrouped = variant.startsWith("epics");
  const showDone = isGrouped;
  const isDragging = variant === "epics";
  const columns = showDone ? COLUMNS : COLUMNS.filter((c) => c.id !== "done");
  const board: ReactNode = (
    <Layout
      height="fill"
      header={<BoardHeader isGrouped={isGrouped} showDone={showDone} />}
      content={
        <LayoutContent role="main" padding={0} isScrollable={false}>
          {isGrouped ? (
            <>
              <Swimlanes columns={columns} ghostAt={isDragging ? { epic: "Project board", status: "in_progress" } : undefined} carried={isDragging ? 47 : undefined} />
              {/* The drag in progress; the pointer position is static for the screenshot. */}
              {isDragging && (
                <Card padding={3} elevation="high" xstyle={[styles.floating, styles.floatingAt(1066, 500, COLUMN_WIDTH - 16)]}>
                  <TaskCardBody task={TASKS.find((t) => t.number === 47)!} showEpic={false} />
                </Card>
              )}
            </>
          ) : (
            <Columns columns={columns} />
          )}
        </LayoutContent>
      }
    />
  );
  return (
    <AppFrame
      selection={{ kind: "board", project: "ai-leash" }}
      titleBar={
        <TitleBar
          icon={<Icon icon={ViewColumnsIcon} size="sm" color="secondary" />}
          title="ai-leash board"
          subtitle="Project chat · Claude Code · 3 tasks in progress"
          controls={
            <SegmentedControl label="Board layout" value={variant === "both" ? "both" : "board"} onChange={() => {}} size="sm">
              <SegmentedControlItem label="Board" value="board" />
              <SegmentedControlItem label="Both" value="both" />
              <SegmentedControlItem label="Chat" value="chat" />
            </SegmentedControl>
          }
        />
      }
    >
      {variant === "both" ? <Workspace center={board} panel={<ProjectChat />} /> : board}
    </AppFrame>
  );
}
