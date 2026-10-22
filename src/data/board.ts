import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import {
  api,
  type Board,
  type BoardSummary,
  type Task,
  type TaskEffort,
  type TaskPriority,
  type TaskStatus,
} from "../lib/tauriApi";
import { useTauriEvent } from "../lib/useTauriEvent";
import { qk } from "./keys";

export type { Board, BoardSummary, Task, TaskEffort, TaskPriority, TaskStatus };

// Column order on the board, left to right.
export const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

export const TASK_PRIORITIES: TaskPriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const TASK_EFFORTS: TaskEffort[] = ["xs", "s", "m", "l", "xl"];

// The reasoning effort a task of this size starts with on one of our own
// providers — same mapping as Rust's `board::lifecycle::effort_for_size`.
export function effortForSize(size: TaskEffort | null): string | null {
  if (size === "xs" || size === "s") return "low";
  if (size === "m") return "medium";
  if (size === "l" || size === "xl") return "high";
  return null;
}

// One project's board. `includeOlderDone` pulls in Done tasks older than the
// last 30 days too. Kept live by `useBoardListener`; the previous variant
// stays on screen while the other one loads, so toggling "load older"
// doesn't flash an empty board.
export function useBoard(
  projectRoot: string,
  includeOlderDone: boolean,
): Board | undefined {
  const { data } = useQuery({
    queryKey: qk.board(projectRoot, includeOlderDone),
    queryFn: () => api.getBoard(projectRoot, includeOlderDone),
    placeholderData: keepPreviousData,
  });
  return data;
}

const NO_SUMMARIES: BoardSummary[] = [];

// Per-column counts for every project with a board.
export function useBoardSummaries(): BoardSummary[] {
  const { data } = useQuery({
    queryKey: qk.boardSummaries,
    queryFn: api.listBoardSummaries,
  });
  return data ?? NO_SUMMARIES;
}

// One always-mounted `board://changed` listener (see
// `useConversationsListener` for why one global listener). The payload only
// names the project, so this refetches rather than patches.
export function useBoardListener() {
  useTauriEvent<{ projectRoot: string; taskId: string | null; reason: string }>(
    "board://changed",
    (payload) => {
      void queryClient.invalidateQueries({
        queryKey: qk.boardOf(payload.projectRoot),
      });
      void queryClient.invalidateQueries({ queryKey: qk.boardSummaries });
    },
  );
}

// The tasks in one column, in display order.
export function columnTasks(tasks: Task[], status: TaskStatus): Task[] {
  return tasks
    .filter((t) => t.status === status)
    .sort((a, b) => a.position - b.position);
}

// Where `moveTask` will put a card, so the board can show it there before
// the round trip finishes — the same midpoint Rust picks (`db::move_task`).
// Rust renumbers a column whose gap gets too small; the refetch after the
// move brings those positions back.
function positionBefore(
  tasks: Task[],
  taskId: string,
  status: TaskStatus,
  beforeId: string | null,
): number {
  const column = columnTasks(tasks, status).filter((t) => t.id !== taskId);
  const index =
    beforeId === null
      ? column.length
      : Math.max(
          0,
          column.findIndex((t) => t.id === beforeId),
        );
  const prev = column[index - 1]?.position;
  const next = column[index]?.position;
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + 1024;
  if (next !== undefined) return next - 1024;
  return 1024;
}

// Drag and drop: shows the card in its new place at once, then asks Rust to
// make it so; `board://changed` (or a failure) brings the real order back.
export async function moveTask(
  projectRoot: string,
  taskId: string,
  status: TaskStatus,
  beforeId: string | null,
): Promise<void> {
  const prefix = qk.boardOf(projectRoot);
  await queryClient.cancelQueries({ queryKey: prefix });
  queryClient.setQueriesData<Board>({ queryKey: prefix }, (board) => {
    if (!board) return board;
    const position = positionBefore(board.tasks, taskId, status, beforeId);
    return {
      ...board,
      tasks: board.tasks.map((t) =>
        t.id === taskId ? { ...t, status, position } : t,
      ),
    };
  });
  try {
    await api.moveTask(taskId, status, beforeId);
  } finally {
    void queryClient.invalidateQueries({ queryKey: prefix });
  }
}
