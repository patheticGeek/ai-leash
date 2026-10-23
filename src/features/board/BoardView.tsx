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
import { Layers, Plus, Rows3, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
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
import TaskCard, { TaskCardBody } from "./TaskCard";
import TaskDialog from "./TaskDialog";
import { EpicDot } from "./TaskMeta";
import { useFinishTask } from "./useFinishTask";

// Epic filter values besides an epic's own id. Radix `Select` reserves "".
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

function Column({
  lane,
  status,
  tasks,
  epicsById,
  fill,
  showHeader,
  onOpen,
  onStart,
  onOpenChat,
  onAdd,
}: {
  lane: string;
  status: TaskStatus;
  tasks: Task[];
  epicsById: Map<string, Epic>;
  // Grows to the board's height and scrolls on its own (ungrouped board),
  // rather than sizing to its cards (one row of swimlanes).
  fill: boolean;
  showHeader: boolean;
  onOpen: (task: Task) => void;
  onStart: (task: Task) => void;
  onOpenChat: (task: Task) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(lane, status),
    data: { type: "column", lane, status },
  });
  return (
    <div
      className={cn(
        "flex w-72 min-w-60 shrink-0 flex-col rounded-lg bg-sunken/60",
        fill && "min-h-0",
        isOver && "bg-white/[0.04]",
      )}
    >
      {showHeader && (
        <div className="group flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-1.5 text-xs font-medium text-zinc-400">
          <span>{STATUS_LABELS[status]}</span>
          <span className="tabular-nums text-zinc-600">{tasks.length}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            title={`New task in ${STATUS_LABELS[status]}`}
            onClick={onAdd}
            className="ml-auto opacity-0 group-hover:opacity-100"
          >
            <Plus />
          </Button>
        </div>
      )}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-1.5 px-1.5 pb-1.5",
          fill ? "min-h-0 flex-1 overflow-y-auto" : "min-h-12",
          !showHeader && "pt-1.5",
        )}
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
              onOpen={() => onOpen(task)}
              onStart={() => onStart(task)}
              onOpenChat={() => onOpenChat(task)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

type Editing =
  | { kind: "edit"; task: Task }
  | { kind: "new"; status: TaskStatus; epicId: string | null };

// One project's Kanban board: Backlog → Todo → In progress → Review (→ Done,
// hidden until asked for). Cards drag between columns, and between epic
// swimlanes when grouped.
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

  const doneShown = tasks.filter((t) => t.status === "done").length;
  const olderDoneHidden = (board?.doneCount ?? 0) - doneShown;

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
    setMoveError(null);
    // Into Done from elsewhere: finishing removes the task's worktree.
    const done =
      data.status === "done" && task.status !== "done"
        ? finish(task, beforeId)
        : moveTask(projectRoot, task.id, data.status, beforeId);
    done.catch((err) => setMoveError(String(err)));
  }

  const cardHandlers = {
    onOpen: (task: Task) => setEditing({ kind: "edit", task }),
    onStart: (task: Task) => setStarting(task),
    onOpenChat: (task: Task) => {
      if (task.conversationId) void openConversation(task.conversationId);
    },
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/5 px-3 py-2">
        <Select value={epicFilter} onValueChange={setEpicFilter}>
          <SelectTrigger
            size="sm"
            className="border-none bg-white/[0.04] text-xs text-zinc-400 hover:bg-white/5"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value={ALL_EPICS}>All epics</SelectItem>
            <SelectItem value={NO_EPIC}>No epic</SelectItem>
            {epics.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                <EpicDot color={e.color} />
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={groupByEpic ? "chip-primary" : "chip"}
          size="sm"
          bordered={false}
          onClick={() => setGroupByEpic((v) => !v)}
          title="Group the board into one row per epic"
        >
          <Rows3 size={13} />
          Group by epic
        </Button>
        <Button
          variant={showDone ? "chip-primary" : "chip"}
          size="sm"
          bordered={false}
          onClick={() => setShowDone((v) => !v)}
        >
          {showDone ? "Hide done" : "Show done"}
          <span className="tabular-nums opacity-60">
            {board?.doneCount ?? 0}
          </span>
        </Button>
        {showDone && !includeOlderDone && olderDoneHidden > 0 && (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setIncludeOlderDone(true)}
            title="Done tasks older than 30 days"
          >
            Load {olderDoneHidden} older
          </Button>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          title="Board settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEpicsOpen(true)}>
          <Layers size={13} />
          Epics
        </Button>
        <Button
          variant="chip-primary"
          size="sm"
          onClick={() =>
            setEditing({
              kind: "new",
              status: "todo",
              epicId:
                epicFilter === ALL_EPICS || epicFilter === NO_EPIC
                  ? null
                  : epicFilter,
            })
          }
        >
          <Plus size={13} />
          New task
        </Button>
      </div>
      {moveError && (
        <button
          type="button"
          onClick={() => setMoveError(null)}
          className="shrink-0 border-b border-white/5 bg-destructive/10 px-3 py-1.5 text-left text-xs text-destructive"
        >
          {moveError}
        </button>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div
          className={cn(
            "min-h-0 flex-1 overflow-auto p-3",
            !groupByEpic && "flex gap-3",
          )}
        >
          {groupByEpic ? (
            <div className="flex w-max flex-col gap-4">
              <div className="flex gap-3">
                {statuses.map((status) => (
                  <div
                    key={status}
                    className="flex w-72 min-w-60 shrink-0 gap-2 px-3 text-xs font-medium text-zinc-400"
                  >
                    {STATUS_LABELS[status]}
                    <span className="tabular-nums text-zinc-600">
                      {columnTasks(filtered, status).length}
                    </span>
                  </div>
                ))}
              </div>
              {lanes.map((lane) => (
                <div key={lane.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-zinc-300">
                    {lane.epic && <EpicDot color={lane.epic.color} />}
                    {lane.label}
                    <span className="tabular-nums text-zinc-600">
                      {laneTasks(lane).length}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    {statuses.map((status) => (
                      <Column
                        key={status}
                        lane={lane.key}
                        status={status}
                        tasks={columnTasks(laneTasks(lane), status)}
                        epicsById={epicsById}
                        fill={false}
                        showHeader={false}
                        {...cardHandlers}
                        onAdd={() =>
                          setEditing({
                            kind: "new",
                            status,
                            epicId: lane.epicId ?? null,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            statuses.map((status) => (
              <Column
                key={status}
                lane={ALL_EPICS}
                status={status}
                tasks={columnTasks(filtered, status)}
                epicsById={epicsById}
                fill
                showHeader
                {...cardHandlers}
                onAdd={() =>
                  setEditing({
                    kind: "new",
                    status,
                    epicId:
                      epicFilter === ALL_EPICS || epicFilter === NO_EPIC
                        ? null
                        : epicFilter,
                  })
                }
              />
            ))
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="w-72">
              <TaskCardBody
                task={dragging}
                epic={
                  dragging.epicId ? epicsById.get(dragging.epicId) : undefined
                }
                dragging
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
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
    </div>
  );
}
