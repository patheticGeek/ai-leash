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
  borderVars,
  colorVars,
  radiusVars,
  sizeVars,
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
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  FoldHorizontal,
  Inbox,
  Layers,
  type LucideIcon,
  Plus,
  RefreshCw,
  Rows3,
  Settings2,
} from "lucide-react";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  columnTasks,
  moveTask,
  STATUS_LABELS,
  TASK_STATUSES,
  useBoard,
} from "../../data/board";
import { LS_KEYS } from "../../lib/localStorageKeys";
import { api, type Epic, type Task, type TaskStatus } from "../../lib/tauriApi";
import { useCurrentGitBranch } from "../../lib/useCurrentGitBranch";
import { useAppStore } from "../../store";
import BoardSettingsDialog from "./BoardSettingsDialog";
import EpicsDialog from "./EpicsDialog";
import NewTaskDialog from "./NewTaskDialog";
import StartTaskDialog from "./StartTaskDialog";
import TaskCard, { FloatingTaskCard, type TaskCardHandlers } from "./TaskCard";
import TaskDetailsDialog from "./TaskDetailsDialog";
import { EpicToken, STATUS_DOT } from "./TaskMeta";
import { useBoardViewPrefs } from "./useBoardViewPrefs";
import { useFinishTask } from "./useFinishTask";

// A status column's minimum width, in px: the kanban-board template's
// COLUMN_WIDTH (Astryx has no size token this large). Columns never go
// narrower: a narrow board (the project chat docked beside it) scrolls
// sideways; a wider one shares the extra space between its columns.
const COLUMN_MIN_WIDTH = 300;

const styles = stylex.create({
  boardColumns: {
    flexDirection: "row",
    overflowX: "auto",
    overflowY: "hidden",
    height: "100%",
    padding: spacingVars["--spacing-4"],
  },
  columnShell: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: COLUMN_MIN_WIDTH,
    minWidth: COLUMN_MIN_WIDTH,
    height: "100%",
  },
  // The column (or lane cell) a dragged card is over.
  dropTarget: {
    outlineWidth: borderVars["--border-width"],
    outlineStyle: "solid",
    outlineColor: colorVars["--color-border-emphasized"],
  },
  // The Done column collapsed: a narrow, full-height strip that opens it.
  doneStrip: {
    flexShrink: 0,
    width: spacingVars["--spacing-12"],
    minWidth: spacingVars["--spacing-12"],
    height: "100%",
  },
  // Its one button fills the strip, its count and label at the top.
  doneStripButton: {
    height: "100%",
    alignItems: "flex-start",
    paddingInline: 0,
    paddingBlock: spacingVars["--spacing-3"],
  },
  // In the swimlanes' header row, the strip is only as tall as the row.
  doneStripHeader: { height: "auto", minHeight: "100%" },
  verticalLabel: { writingMode: "vertical-rl" },
  columnBody: { minHeight: "100%" },
  // Every column header as tall as one with its + (a sm IconButton), so
  // Review and Done — which have no + — line up with the rest.
  columnHeader: { minHeight: sizeVars["--size-element-sm"] },
  fillArea: { minHeight: 0 },
  columnEmptyState: { paddingBlock: spacingVars["--spacing-10"] },
  toolbarDivider: {
    height: "auto",
    marginBlock: spacingVars["--spacing-1"],
    alignSelf: "stretch",
  },
  // Swimlanes: one grid, one column per status. Each lane is a full-width
  // header row (spanning every column) followed by its cells. No padding on
  // the scroller itself: the sticky header row pins flush to its top edge
  // and carries the spacing-4 gutter inside it.
  swimScroll: { overflow: "auto", height: "100%" },
  // Same columns as the ungrouped board: at least COLUMN_MIN_WIDTH, sharing
  // any extra width. The grid's own minimum (columns + gaps + its gutters)
  // is what makes the scroller scroll sideways once it's narrower.
  swimGrid: (columns: number) => ({
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, minmax(${COLUMN_MIN_WIDTH}px, 1fr))`,
    columnGap: spacingVars["--spacing-4"],
    width: "100%",
    minWidth: `calc(${columns} * ${COLUMN_MIN_WIDTH}px + ${columns + 1} * ${spacingVars["--spacing-4"]})`,
    paddingInline: spacingVars["--spacing-4"],
    paddingBlockEnd: spacingVars["--spacing-4"],
  }),
  // The same, with Done collapsed: `open` columns, then Done's narrow track.
  swimGridDoneCollapsed: (open: number) => ({
    display: "grid",
    gridTemplateColumns: `repeat(${open}, minmax(${COLUMN_MIN_WIDTH}px, 1fr)) ${spacingVars["--spacing-12"]}`,
    columnGap: spacingVars["--spacing-4"],
    width: "100%",
    minWidth: `calc(${open} * ${COLUMN_MIN_WIDTH}px + ${spacingVars["--spacing-12"]} + ${open + 2} * ${spacingVars["--spacing-4"]})`,
    paddingInline: spacingVars["--spacing-4"],
    paddingBlockEnd: spacingVars["--spacing-4"],
  }),
  stickyTop: {
    position: "sticky",
    insetBlockStart: 0,
    zIndex: 2,
    paddingBlockStart: spacingVars["--spacing-4"],
    backgroundColor: colorVars["--color-background-surface"],
  },
  // A column header, or one lane's cell of a column: the template's muted
  // column surface, so each lane reads as its own row of column blocks.
  cell: {
    backgroundColor: colorVars["--color-background-muted"],
    borderRadius: radiusVars["--radius-container"],
    minWidth: 0,
  },
  cellBody: { minHeight: spacingVars["--spacing-10"] },
  // The epic's header row, across every column, between the lanes.
  laneHeader: {
    gridColumn: "1 / -1",
    paddingBlockStart: spacingVars["--spacing-4"],
    paddingBlockEnd: spacingVars["--spacing-2"],
  },
  // Its name, pinned to the scroller's start edge (past the grid's gutter)
  // while the board scrolls sideways.
  laneLabel: {
    position: "sticky",
    insetInlineStart: spacingVars["--spacing-4"],
    zIndex: 1,
    width: "max-content",
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

// Which swimlanes are collapsed, as `${projectRoot}\n${lane key}` (an epic
// id, or "none"), remembered across restarts.
function readCollapsedLanes(): Set<string> {
  try {
    const stored = JSON.parse(
      localStorage.getItem(LS_KEYS.boardCollapsedLanes) ?? "[]",
    );
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

// A swimlane: every task (`epicId` undefined, the ungrouped board), one
// epic's, or the tasks with no epic (`epicId` null).
interface Lane {
  key: string;
  epicId: string | null | undefined;
  epic?: Epic;
  label: string;
}

// The ungrouped board's one lane.
const WHOLE_BOARD: Lane = { key: ALL_EPICS, epicId: undefined, label: "" };

const columnDropId = (lane: string, status: TaskStatus) =>
  `column:${lane}:${status}`;

function ColumnHeader({
  status,
  count,
  onAdd,
  onCollapse,
}: {
  status: TaskStatus;
  count: number;
  onAdd: () => void;
  // Done only: folds the column back into its strip.
  onCollapse?: () => void;
}) {
  const title = STATUS_LABELS[status];
  return (
    <HStack hAlign="between" vAlign="center" xstyle={styles.columnHeader}>
      <HStack gap={2} vAlign="center">
        <StatusDot variant={STATUS_DOT[status]} label={`${title} status`} />
        <Heading level={4} weight="normal" accessibilityLevel={2}>
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
        {/* Review and Done are where work ends up, not where it starts:
            tasks reach them from a chat or a drag, so no + there. */}
        {status !== "review" && status !== "done" && (
          <IconButton
            variant="ghost"
            size="sm"
            label={`Add a task to ${title}`}
            tooltip={`Add a task to ${title}`}
            icon={<Icon icon={Plus} size="sm" />}
            onClick={onAdd}
          />
        )}
        {onCollapse && (
          <IconButton
            variant="ghost"
            size="sm"
            // Arrows folding inward: the column collapses back to its strip.
            label="Collapse Done column"
            tooltip="Collapse Done column"
            aria-expanded
            icon={<Icon icon={FoldHorizontal} size="sm" />}
            onClick={onCollapse}
          />
        )}
      </HStack>
    </HStack>
  );
}

// The Done column collapsed: one button that opens it, showing the count
// (and, outside the swimlanes' header row, a vertical "Done"). It's also a
// drop target: a card dropped on it is finished, like one dropped into Done.
function DoneStrip({
  lane,
  count,
  onExpand,
  isHeader,
}: {
  lane: string;
  count: number;
  onExpand: () => void;
  // In the swimlanes' header row: just the count, as tall as the row.
  isHeader: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(lane, "done"),
    data: { type: "column", lane, status: "done" },
  });
  return (
    <Card
      ref={setNodeRef}
      variant="muted"
      padding={0}
      xstyle={[
        styles.doneStrip,
        isHeader && styles.doneStripHeader,
        isOver && styles.dropTarget,
      ]}
    >
      <Button
        variant="ghost"
        label="Show done"
        tooltip="Show done"
        aria-expanded={false}
        width="100%"
        xstyle={styles.doneStripButton}
        onClick={onExpand}
      >
        <VStack gap={2} hAlign="center">
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {count}
          </Text>
          {!isHeader && (
            <Text
              type="supporting"
              color="secondary"
              xstyle={styles.verticalLabel}
            >
              {STATUS_LABELS.done}
            </Text>
          )}
        </VStack>
      </Button>
    </Card>
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

// One lane's Done cell while Done is collapsed: the narrow, empty track
// under the header's strip. Dropping a card on it finishes the card (and
// moves it to this lane's epic).
function CollapsedDoneCell({ lane }: { lane: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(lane, "done"),
    data: { type: "column", lane, status: "done" },
  });
  return (
    <VStack
      ref={setNodeRef}
      xstyle={[styles.cell, styles.cellBody, isOver && styles.dropTarget]}
    />
  );
}

type Editing =
  | { kind: "details"; taskId: string }
  | { kind: "new"; status: TaskStatus; epicId: string | null };

// One project's Kanban board, on the kanban-board template: Backlog → Todo →
// In progress → Review → Done, the last collapsed to a narrow strip until
// opened. Cards drag between columns, and between epic swimlanes when grouped.
export default function BoardView({ projectRoot }: { projectRoot: string }) {
  const [prefs, setPrefs] = useBoardViewPrefs(projectRoot);
  // `showDone` is whether the Done column is expanded.
  const { showDone: isDoneExpanded, groupByEpic, includeOlderDone } = prefs;
  const setDoneExpanded = (showDone: boolean) => setPrefs({ showDone });
  // Opening Done from its strip scrolls the board to its end, so the column
  // you just opened is in view rather than past the right edge. Only once
  // it has rendered (the effect below), and only when opened by hand — not
  // when a board loads with Done already open.
  const scrollerRef = useRef<HTMLElement>(null);
  const scrollToDone = useRef(false);
  const expandDone = () => {
    scrollToDone.current = true;
    setDoneExpanded(true);
  };
  useEffect(() => {
    if (!isDoneExpanded || !scrollToDone.current) return;
    scrollToDone.current = false;
    const el = scrollerRef.current;
    el?.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [isDoneExpanded]);
  const [pickedEpic, setPickedEpic] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [epicsOpen, setEpicsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [starting, setStarting] = useState<Task | null>(null);
  const [collapsedLanes, setCollapsedLanes] = useState(readCollapsedLanes);
  const laneId = (lane: Lane) => `${projectRoot}\n${lane.key}`;
  const toggleLane = (lane: Lane) =>
    setCollapsedLanes((prev) => {
      const next = new Set(prev);
      if (!next.delete(laneId(lane))) next.add(laneId(lane));
      localStorage.setItem(
        LS_KEYS.boardCollapsedLanes,
        JSON.stringify([...next]),
      );
      return next;
    });
  const [boardError, setBoardError] = useState<{
    title: string;
    message: string;
  } | null>(null);
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
  // A remembered epic that's since been deleted or archived falls back to
  // All epics (only once the board has loaded, so it isn't judged early).
  // An archived epic picked in the menu this session still applies.
  const filterEpic = epicsById.get(prefs.epicFilter);
  const epicFilter =
    !board ||
    prefs.epicFilter === ALL_EPICS ||
    prefs.epicFilter === NO_EPIC ||
    (filterEpic && (!filterEpic.archived || pickedEpic === filterEpic.id))
      ? prefs.epicFilter
      : ALL_EPICS;
  // Every column renders (Done collapsed or not); these are the ones whose
  // cards show.
  const statuses = TASK_STATUSES;
  const shownStatuses = isDoneExpanded
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

  const allLanes: Lane[] = groupByEpic
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
    : [WHOLE_BOARD];

  const laneTasks = (lane: Lane) =>
    lane.epicId === undefined
      ? filtered
      : filtered.filter((t) => t.epicId === lane.epicId);
  // Grouped, a lane with no visible cards (after the epic filter; collapsed
  // Done shows none) is hidden; a Done cell offering only "Load older"
  // doesn't count.
  // If that hides every lane, the plain columns show instead.
  const lanes = allLanes.filter(
    (lane) =>
      lane.epicId === undefined ||
      laneTasks(lane).some((t) => shownStatuses.includes(t.status)),
  );

  const doneCount = board?.doneCount ?? 0;
  const doneShown = tasks.filter((t) => t.status === "done").length;
  const olderDoneHidden = doneCount - doneShown;
  const shownCount = filtered.filter((t) =>
    shownStatuses.includes(t.status),
  ).length;
  const loadOlder =
    !includeOlderDone && olderDoneHidden > 0 ? (
      <Button
        variant="ghost"
        size="sm"
        label={`Load ${olderDoneHidden} older`}
        tooltip="Done tasks older than 30 days"
        onClick={() => setPrefs({ includeOlderDone: true })}
      />
    ) : null;

  function move(task: Task, status: TaskStatus, beforeId: string | null) {
    setBoardError(null);
    // Into Done from elsewhere: finishing removes the task's worktree.
    const done =
      status === "done" && task.status !== "done"
        ? finish(task, beforeId)
        : moveTask(projectRoot, task.id, status, beforeId);
    done.catch((err) =>
      setBoardError({ title: "Couldn't move the task", message: String(err) }),
    );
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
    // The swimlanes' header-row Done strip drops into Done without
    // changing the card's epic, like the ungrouped board.
    const lane =
      lanes.find((l) => l.key === data.lane) ??
      (data.lane === ALL_EPICS ? WHOLE_BOARD : undefined);
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
    onOpen: (task) => setEditing({ kind: "details", taskId: task.id }),
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
            <Heading level={3} weight="normal" accessibilityLevel={1}>
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
              onChange={(epicFilter) => {
                setPickedEpic(epicFilter);
                setPrefs({ epicFilter });
              }}
              options={[
                { value: ALL_EPICS, label: "All epics" },
                { value: NO_EPIC, label: "No epic" },
                ...(epics.length > 0 ? [{ type: "divider" as const }] : []),
                ...epics.map((e) => ({ value: e.id, label: e.title })),
              ]}
              renderOption={(o) => {
                const epic = epicsById.get(o.value);
                return epic ? <EpicToken epic={epic} /> : o.label;
              }}
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
                onPressedChange={(groupByEpic) => setPrefs({ groupByEpic })}
                icon={<Icon icon={Rows3} size="sm" />}
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
    <HStack ref={scrollerRef} gap={4} xstyle={styles.boardColumns}>
      {statuses.map((status) => {
        const cards = columnTasks(filtered, status);
        if (status === "done" && !isDoneExpanded) {
          return (
            <DoneStrip
              key={status}
              lane={ALL_EPICS}
              count={doneCount}
              onExpand={expandDone}
              isHeader={false}
            />
          );
        }
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
                    onCollapse={
                      status === "done"
                        ? () => setDoneExpanded(false)
                        : undefined
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
    <VStack ref={scrollerRef} xstyle={styles.swimScroll}>
      <VStack
        xstyle={
          isDoneExpanded
            ? styles.swimGrid(statuses.length)
            : styles.swimGridDoneCollapsed(statuses.length - 1)
        }
      >
        {statuses.map((status) => (
          <VStack key={status} xstyle={styles.stickyTop}>
            {status === "done" && !isDoneExpanded ? (
              <DoneStrip
                lane={ALL_EPICS}
                count={doneCount}
                onExpand={expandDone}
                isHeader
              />
            ) : (
              <VStack padding={3} xstyle={styles.cell}>
                <ColumnHeader
                  status={status}
                  count={columnTasks(filtered, status).length}
                  onAdd={() =>
                    setEditing({ kind: "new", status, epicId: filterEpicId })
                  }
                  onCollapse={
                    status === "done" ? () => setDoneExpanded(false) : undefined
                  }
                />
              </VStack>
            )}
          </VStack>
        ))}
        {lanes.map((lane, li) => {
          const inLane = laneTasks(lane);
          const isLast = li === lanes.length - 1;
          const isCollapsed = collapsedLanes.has(laneId(lane));
          const count = inLane.filter((t) =>
            shownStatuses.includes(t.status),
          ).length;
          return (
            <Fragment key={lane.key}>
              <VStack gap={3} xstyle={styles.laneHeader}>
                {li > 0 && <Divider />}
                <HStack gap={2} vAlign="center" xstyle={styles.laneLabel}>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={`${isCollapsed ? "Expand" : "Collapse"} ${lane.label}`}
                    tooltip={isCollapsed ? "Expand" : "Collapse"}
                    icon={
                      <Icon
                        icon={isCollapsed ? ChevronRight : ChevronDown}
                        size="sm"
                      />
                    }
                    onClick={() => toggleLane(lane)}
                  />
                  {lane.epic ? (
                    <EpicToken epic={lane.epic} size="md" />
                  ) : (
                    <Text>{lane.label}</Text>
                  )}
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {count} {count === 1 ? "task" : "tasks"}
                  </Text>
                </HStack>
              </VStack>
              {!isCollapsed &&
                statuses.map((status) =>
                  status === "done" && !isDoneExpanded ? (
                    <CollapsedDoneCell key={status} lane={lane.key} />
                  ) : (
                    <VStack key={status} xstyle={styles.cell}>
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
                  ),
                )}
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
              {boardError && (
                <Banner
                  status="error"
                  container="section"
                  title={boardError.title}
                  description={boardError.message}
                  isDismissable
                  onDismiss={() => setBoardError(null)}
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
                  {groupByEpic && lanes.length > 0 ? swimlanes : columns}
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
                        // DragOverlay sizes itself to the card picked up.
                        width="100%"
                      />
                    )}
                  </DragOverlay>
                </DndContext>
              </StackItem>
            </VStack>
          </LayoutContent>
        }
      />
      <NewTaskDialog
        open={editing?.kind === "new"}
        onOpenChange={(open) => !open && setEditing(null)}
        projectRoot={projectRoot}
        epics={epics}
        status={editing?.kind === "new" ? editing.status : undefined}
        epicId={editing?.kind === "new" ? editing.epicId : undefined}
        boardDefaults={board?.agentDefaults ?? {}}
        sharedCheckout={sharedCheckout}
        onStartFailed={(message) =>
          setBoardError({ title: "Couldn't start the task", message })
        }
      />
      <TaskDetailsDialog
        task={
          editing?.kind === "details"
            ? (tasks.find((t) => t.id === editing.taskId) ?? null)
            : null
        }
        onClose={() => setEditing(null)}
        projectRoot={projectRoot}
        epics={epics}
        boardDefaults={board?.agentDefaults ?? {}}
        sharedCheckout={sharedCheckout}
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
