import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { InfoTip } from "@astryxdesign/core/InfoTip";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import * as stylex from "@stylexjs/stylex";
import {
  Archive,
  CircleCheck,
  ClipboardCheck,
  Inbox,
  Layers,
  type LucideIcon,
  Plus,
  RefreshCw,
  Rows3,
  Settings2,
} from "lucide-react";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import {
  columnTasks,
  moveTask,
  STATUS_LABELS,
  TASK_STATUSES,
  useBoard,
} from "../../data/board";
import { api, type Epic, type Task, type TaskStatus } from "../../lib/tauriApi";
import { useCurrentGitBranch } from "../../lib/useCurrentGitBranch";
import { useAppStore } from "../../store";
import BoardSettingsDialog from "./BoardSettingsDialog";
import EpicsDialog from "./EpicsDialog";
import StartTaskDialog from "./StartTaskDialog";
import TaskCard, { FloatingTaskCard, type TaskCardHandlers } from "./TaskCard";
import TaskDialog from "./TaskDialog";
import { EpicDot, EpicToken, STATUS_DOT } from "./TaskMeta";
import { useFinishTask } from "./useFinishTask";

// The kanban-board template's fixed column width. Columns never shrink: a
// narrow board (the project chat docked beside it) scrolls sideways.
const COLUMN_WIDTH = 260;
// The epic label column in swimlanes, including the spacing-4 gutter it
// carries on its start edge.
const LANE_LABEL_WIDTH = 196;

const styles = stylex.create({
  boardColumns: {
    flexDirection: "row",
    overflowX: "auto",
    overflowY: "hidden",
    height: "100%",
    padding: spacingVars["--spacing-4"],
  },
  columnShell: { flexShrink: 0, flexBasis: COLUMN_WIDTH, height: "100%" },
  // The column (or lane cell) a dragged card is over.
  dropTarget: {
    outlineWidth: "1px",
    outlineStyle: "solid",
    outlineColor: colorVars["--color-border-emphasized"],
  },
  columnBody: { minHeight: "100%" },
  fillArea: { minHeight: 0 },
  columnEmptyState: { paddingBlock: spacingVars["--spacing-10"] },
  toolbarDivider: {
    height: "auto",
    marginBlock: spacingVars["--spacing-1"],
    alignSelf: "stretch",
  },
  // Swimlanes: one grid, the lane label column + one column per status.
  // No padding on the scroller itself: sticky cells pin to its edge and
  // carry the spacing-4 gutter inside them, so nothing scrolls under a gap.
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
  cellBody: { minHeight: spacingVars["--spacing-10"] },
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
  // Pinned to the scroller's start edge while the board scrolls sideways.
  laneLabel: {
    position: "sticky",
    insetInlineStart: 0,
    zIndex: 2,
    paddingInlineStart: spacingVars["--spacing-4"],
    backgroundColor: colorVars["--color-background-surface"],
  },
});

const COLUMN_META: Record<
  TaskStatus,
  { tooltip: string; emptyTitle: string; emptyIcon: LucideIcon }
> = {
  backlog: {
    tooltip: "Ideas and tasks not planned yet.",
    emptyTitle: "Backlog is empty",
    emptyIcon: Archive,
  },
  todo: {
    tooltip: "Planned tasks, ready to start.",
    emptyTitle: "Nothing to do",
    emptyIcon: Inbox,
  },
  in_progress: {
    tooltip: "Tasks whose chat is working or waiting on you.",
    emptyTitle: "Nothing in progress",
    emptyIcon: RefreshCw,
  },
  review: {
    tooltip: "Finished by the agent, waiting for your review.",
    emptyTitle: "Nothing in review",
    emptyIcon: ClipboardCheck,
  },
  done: {
    tooltip: "Finished tasks. Ones older than 30 days load on demand.",
    emptyTitle: "Nothing done yet",
    emptyIcon: CircleCheck,
  },
};

// Epic filter values besides an epic's own id.
const ALL_EPICS = "all";
const NO_EPIC = "none";

// A swimlane: every task (`epicId` undefined, the ungrouped board), one
// epic's, or the tasks with no epic (`epicId` null).
interface Lane {
  key: string;
  epicId: string | null | undefined;
  epic?: Epic;
  label: string;
}

const columnDropId = (lane: string, status: TaskStatus) =>
  `column:${lane}:${status}`;

function ColumnHeader({
  status,
  count,
  onAdd,
}: {
  status: TaskStatus;
  count: number;
  onAdd: () => void;
}) {
  const title = STATUS_LABELS[status];
  return (
    <HStack hAlign="between" vAlign="center">
      <HStack gap={2} vAlign="center">
        <StatusDot variant={STATUS_DOT[status]} label={`${title} status`} />
        <Heading level={4} accessibilityLevel={2}>
          {title}
        </Heading>
        <InfoTip
          content={COLUMN_META[status].tooltip}
          label={`About ${title}`}
        />
      </HStack>
      <HStack gap={1} vAlign="center">
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {count}
        </Text>
        <IconButton
          variant="ghost"
          size="sm"
          label={`Add a task to ${title}`}
          tooltip={`Add a task to ${title}`}
          icon={<Icon icon={Plus} size="sm" />}
          onClick={onAdd}
        />
      </HStack>
    </HStack>
  );
}

// The cards of one column (or one lane's cell of it), as a drop target.
function CardList({
  lane,
  status,
  tasks,
  epicsById,
  showEpic,
  handlers,
  isEmptyStateShown,
  footer,
}: {
  lane: string;
  status: TaskStatus;
  tasks: Task[];
  epicsById: Map<string, Epic>;
  showEpic: boolean;
  handlers: TaskCardHandlers;
  // The column's EmptyState when it has no cards (not in swimlane cells,
  // which stay a slim drop target instead).
  isEmptyStateShown: boolean;
  footer?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(lane, status),
    data: { type: "column", lane, status },
  });
  const meta = COLUMN_META[status];
  return (
    <VStack
      ref={setNodeRef}
      gap={2}
      padding={2}
      xstyle={[
        isEmptyStateShown ? styles.columnBody : styles.cellBody,
        isOver && styles.dropTarget,
      ]}
    >
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            lane={lane}
            epic={task.epicId ? epicsById.get(task.epicId) : undefined}
            showEpic={showEpic}
            handlers={handlers}
          />
        ))}
      </SortableContext>
      {isEmptyStateShown && tasks.length === 0 && (
        <EmptyState
          isCompact
          xstyle={styles.columnEmptyState}
          icon={<Icon icon={meta.emptyIcon} size="lg" color="secondary" />}
          title={meta.emptyTitle}
        />
      )}
      {footer}
    </VStack>
  );
}

type Editing =
  | { kind: "edit"; task: Task }
  | { kind: "new"; status: TaskStatus; epicId: string | null };

// One project's Kanban board, on the kanban-board template: Backlog → Todo →
// In progress → Review (→ Done, hidden until asked for). Cards drag between
// columns, and between epic swimlanes when grouped.
export default function BoardView({ projectRoot }: { projectRoot: string }) {
  const [showDone, setShowDone] = useState(false);
  const [includeOlderDone, setIncludeOlderDone] = useState(false);
  const [groupByEpic, setGroupByEpic] = useState(false);
  const [epicFilter, setEpicFilter] = useState(ALL_EPICS);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [epicsOpen, setEpicsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [starting, setStarting] = useState<Task | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const openConversation = useAppStore((s) => s.openConversation);
  const { finish, dialog: finishDialog } = useFinishTask();
  const board = useBoard(projectRoot, includeOlderDone);
  // No branch: not a git repository (or a detached HEAD), so tasks share the
  // main checkout instead of getting worktrees.
  const sharedCheckout = useCurrentGitBranch(projectRoot) === null;
  // A small threshold, so a click still opens the card.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const tasks = board?.tasks ?? [];
  const epics = board?.epics ?? [];
  const epicsById = useMemo(
    () => new Map(epics.map((e) => [e.id, e])),
    [epics],
  );
  const statuses = showDone
    ? TASK_STATUSES
    : TASK_STATUSES.filter((s) => s !== "done");

  const filtered = tasks.filter((t) =>
    epicFilter === ALL_EPICS
      ? true
      : epicFilter === NO_EPIC
        ? t.epicId === null
        : t.epicId === epicFilter,
  );
  const filterEpicId =
    epicFilter === ALL_EPICS || epicFilter === NO_EPIC ? null : epicFilter;

  const lanes: Lane[] = groupByEpic
    ? [
        ...epics
          .filter(
            (e) =>
              (!e.archived || filtered.some((t) => t.epicId === e.id)) &&
              (epicFilter === ALL_EPICS || epicFilter === e.id),
          )
          .map((e) => ({ key: e.id, epicId: e.id, epic: e, label: e.title })),
        ...(epicFilter === ALL_EPICS || epicFilter === NO_EPIC
          ? [{ key: NO_EPIC, epicId: null, label: "No epic" }]
          : []),
      ]
    : [{ key: ALL_EPICS, epicId: undefined, label: "" }];

  const laneTasks = (lane: Lane) =>
    lane.epicId === undefined
      ? filtered
      : filtered.filter((t) => t.epicId === lane.epicId);

  const doneCount = board?.doneCount ?? 0;
  const doneShown = tasks.filter((t) => t.status === "done").length;
  const olderDoneHidden = doneCount - doneShown;
  const shownCount = filtered.filter((t) => statuses.includes(t.status)).length;
  const loadOlder =
    !includeOlderDone && olderDoneHidden > 0 ? (
      <Button
        variant="ghost"
        size="sm"
        label={`Load ${olderDoneHidden} older`}
        tooltip="Done tasks older than 30 days"
        onClick={() => setIncludeOlderDone(true)}
      />
    ) : null;

  function move(task: Task, status: TaskStatus, beforeId: string | null) {
    setMoveError(null);
    // Into Done from elsewhere: finishing removes the task's worktree.
    const done =
      status === "done" && task.status !== "done"
        ? finish(task, beforeId)
        : moveTask(projectRoot, task.id, status, beforeId);
    done.catch((err) => setMoveError(String(err)));
  }

  function onDragStart({ active }: DragStartEvent) {
    setDragging(tasks.find((t) => t.id === active.id) ?? null);
  }

  // Works out the target column and the card to land before, then moves
  // (and re-epics, when dropped into another swimlane).
  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const task = tasks.find((t) => t.id === active.id);
    const data = over?.data.current as
      | { type: "column" | "task"; lane: string; status: TaskStatus }
      | undefined;
    if (!task || !over || !data || over.id === active.id) return;
    const lane = lanes.find((l) => l.key === data.lane);
    if (!lane) return;
    const column = columnTasks(laneTasks(lane), data.status);
    let beforeId: string | null = null;
    if (data.type === "task") {
      const overIndex = column.findIndex((t) => t.id === over.id);
      const fromIndex = column.findIndex((t) => t.id === task.id);
      // Dragging down within the same column lands after the hovered
      // card, as the sortable preview shows it.
      beforeId =
        fromIndex !== -1 && fromIndex < overIndex
          ? (column[overIndex + 1]?.id ?? null)
          : String(over.id);
    }
    const epicChanged =
      lane.epicId !== undefined && lane.epicId !== task.epicId;
    // Already right there: same column, same card after it.
    const index = column.findIndex((t) => t.id === task.id);
    const unmoved =
      index !== -1 && (column[index + 1]?.id ?? null) === beforeId;
    if (epicChanged) {
      void api.updateTask(task.id, { epicId: lane.epicId ?? null });
    }
    if (unmoved) return;
    move(task, data.status, beforeId);
  }

  const handlers: TaskCardHandlers = {
    onOpen: (task) => setEditing({ kind: "edit", task }),
    onStart: (task) => setStarting(task),
    onOpenChat: (task) => {
      if (task.conversationId) void openConversation(task.conversationId);
    },
    onMove: (task, status) => move(task, status, null),
  };

  const toolbar = (
    <LayoutHeader hasDivider padding={4}>
      <Toolbar
        label="Board actions"
        gap={2}
        startContent={
          <>
            <Heading level={3} accessibilityLevel={1}>
              Tasks
            </Heading>
            <Badge label={shownCount} variant="neutral" />
          </>
        }
        endContent={
          <HStack gap={2} wrap="wrap" vAlign="center">
            <Selector
              label="Filter by epic"
              isLabelHidden
              width={200}
              value={epicFilter}
              onChange={setEpicFilter}
              options={[
                { value: ALL_EPICS, label: "All epics" },
                { value: NO_EPIC, label: "No epic" },
                ...(epics.length > 0 ? [{ type: "divider" as const }] : []),
                ...epics.map((e) => ({
                  value: e.id,
                  label: e.title,
                  icon: <EpicDot color={e.color} />,
                })),
              ]}
            />
            <Divider
              variant="strong"
              orientation="vertical"
              xstyle={styles.toolbarDivider}
            />
            <HStack gap={1} vAlign="center">
              <ToggleButton
                label="Group by epic"
                tooltip="Group the board into one row per epic"
                isIconOnly
                isPressed={groupByEpic}
                onPressedChange={setGroupByEpic}
                icon={<Icon icon={Rows3} size="sm" />}
              />
              <ToggleButton
                label={`Show done (${doneCount})`}
                isIconOnly
                isPressed={showDone}
                onPressedChange={setShowDone}
                icon={<Icon icon={CircleCheck} size="sm" />}
              />
              <IconButton
                variant="ghost"
                label="Epics"
                tooltip="Epics"
                icon={<Icon icon={Layers} size="sm" />}
                onClick={() => setEpicsOpen(true)}
              />
              <IconButton
                variant="ghost"
                label="Board settings"
                tooltip="Board settings"
                icon={<Icon icon={Settings2} size="sm" />}
                onClick={() => setSettingsOpen(true)}
              />
            </HStack>
            <Button
              variant="primary"
              label="New task"
              icon={<Icon icon={Plus} size="sm" />}
              onClick={() =>
                setEditing({
                  kind: "new",
                  status: "todo",
                  epicId: filterEpicId,
                })
              }
            />
          </HStack>
        }
      />
    </LayoutHeader>
  );

  const columns = (
    <HStack gap={4} xstyle={styles.boardColumns}>
      {statuses.map((status) => {
        const cards = columnTasks(filtered, status);
        return (
          <Card
            key={status}
            variant="muted"
            padding={0}
            xstyle={styles.columnShell}
          >
            <Layout
              height="fill"
              header={
                <LayoutHeader hasDivider padding={3}>
                  <ColumnHeader
                    status={status}
                    count={cards.length}
                    onAdd={() =>
                      setEditing({ kind: "new", status, epicId: filterEpicId })
                    }
                  />
                </LayoutHeader>
              }
              content={
                <LayoutContent padding={0}>
                  <CardList
                    lane={ALL_EPICS}
                    status={status}
                    tasks={cards}
                    epicsById={epicsById}
                    showEpic
                    handlers={handlers}
                    isEmptyStateShown
                    footer={status === "done" ? loadOlder : null}
                  />
                </LayoutContent>
              }
            />
          </Card>
        );
      })}
    </HStack>
  );

  const swimlanes = (
    <VStack xstyle={styles.swimScroll}>
      <VStack xstyle={styles.swimGrid(statuses.length)}>
        <VStack xstyle={styles.corner} />
        {statuses.map((status) => (
          <VStack key={status} xstyle={styles.stickyTop}>
            <VStack padding={3} xstyle={[styles.cell, styles.headCell]}>
              <ColumnHeader
                status={status}
                count={columnTasks(filtered, status).length}
                onAdd={() =>
                  setEditing({ kind: "new", status, epicId: filterEpicId })
                }
              />
            </VStack>
          </VStack>
        ))}
        {lanes.map((lane, li) => {
          const inLane = laneTasks(lane);
          const isLast = li === lanes.length - 1;
          return (
            <Fragment key={lane.key}>
              <VStack
                gap={1}
                hAlign="start"
                paddingBlock={3}
                paddingInlineEnd={3}
                xstyle={styles.laneLabel}
              >
                {lane.epic ? (
                  <EpicToken epic={lane.epic} size="md" />
                ) : (
                  <Text weight="semibold">{lane.label}</Text>
                )}
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {inLane.filter((t) => statuses.includes(t.status)).length}{" "}
                  tasks
                </Text>
              </VStack>
              {statuses.map((status) => (
                <VStack
                  key={status}
                  gap={0}
                  xstyle={[styles.cell, isLast && styles.lastCell]}
                >
                  <Divider />
                  <CardList
                    lane={lane.key}
                    status={status}
                    tasks={columnTasks(inLane, status)}
                    epicsById={epicsById}
                    showEpic={false}
                    handlers={handlers}
                    isEmptyStateShown={false}
                    footer={status === "done" && isLast ? loadOlder : null}
                  />
                </VStack>
              ))}
            </Fragment>
          );
        })}
      </VStack>
    </VStack>
  );

  return (
    <>
      <Layout
        height="fill"
        header={toolbar}
        content={
          <LayoutContent padding={0} isScrollable={false}>
            <VStack height="100%">
              {moveError && (
                <Banner
                  status="error"
                  container="section"
                  title="Couldn't move the task"
                  description={moveError}
                  isDismissable
                  onDismiss={() => setMoveError(null)}
                />
              )}
              <StackItem size="fill" xstyle={styles.fillArea}>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCorners}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragCancel={() => setDragging(null)}
                >
                  {groupByEpic ? swimlanes : columns}
                  <DragOverlay dropAnimation={null}>
                    {dragging && (
                      <FloatingTaskCard
                        task={dragging}
                        epic={
                          dragging.epicId
                            ? epicsById.get(dragging.epicId)
                            : undefined
                        }
                        showEpic={!groupByEpic}
                        width={COLUMN_WIDTH - 16}
                      />
                    )}
                  </DragOverlay>
                </DndContext>
              </StackItem>
            </VStack>
          </LayoutContent>
        }
      />
      <TaskDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        projectRoot={projectRoot}
        epics={epics}
        task={
          editing?.kind === "edit"
            ? (tasks.find((t) => t.id === editing.task.id) ?? editing.task)
            : null
        }
        defaults={
          editing?.kind === "new"
            ? { status: editing.status, epicId: editing.epicId }
            : {}
        }
        onFinish={(task) => finish(task, null)}
      />
      <StartTaskDialog
        task={starting}
        boardDefaults={board?.agentDefaults ?? {}}
        onClose={() => setStarting(null)}
      />
      {finishDialog}
      <BoardSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        projectRoot={projectRoot}
        board={board}
        sharedCheckout={sharedCheckout}
      />
      <EpicsDialog
        open={epicsOpen}
        onOpenChange={setEpicsOpen}
        projectRoot={projectRoot}
        epics={epics}
      />
    </>
  );
}
