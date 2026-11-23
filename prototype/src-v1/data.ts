// Realistic ai-leash content for the prototype screens. Nothing here talks
// to a backend; it is the shape of what the real stores hold.

export type ChatStatus = "idle" | "working" | "approval" | "question";

export interface ChatRow {
  id: string;
  title: string;
  project: string;
  workspace?: string;
  branch?: string;
  task?: number;
  status: ChatStatus;
  elapsed?: string;
}

export interface BoardRow {
  project: string;
  inProgress: number;
  review: number;
  isWorking?: boolean;
}

export const PROJECTS = ["ai-leash", "tidepool", "dotfiles"];

export const BOARDS: BoardRow[] = [
  { project: "ai-leash", inProgress: 3, review: 2, isWorking: true },
  { project: "tidepool", inProgress: 1, review: 0 },
];

export const CHATS: ChatRow[] = [
  {
    id: "c42",
    title: "Astryx: board on the kanban template",
    project: "ai-leash",
    workspace: "task-42",
    branch: "task/42-astryx-board",
    task: 42,
    status: "working",
    elapsed: "3:12",
  },
  {
    id: "c1",
    title: "Fix ACP session restore after switching agents",
    project: "ai-leash",
    branch: "astryx-migration",
    status: "idle",
  },
  {
    id: "c38",
    title: "Split Preferences into Chat / Fonts / Debug",
    project: "ai-leash",
    workspace: "task-38",
    branch: "task/38-settings-split",
    task: 38,
    status: "approval",
  },
  {
    id: "c2",
    title: "Why does the PTY resize lag on drag?",
    project: "ai-leash",
    branch: "astryx-migration",
    status: "question",
  },
  {
    id: "c3",
    title: "Tide table parser drops DST hour",
    project: "tidepool",
    branch: "main",
    status: "idle",
  },
  {
    id: "c40",
    title: "Terminal: honour code font size",
    project: "ai-leash",
    workspace: "task-40",
    branch: "task/40-terminal-font",
    task: 40,
    status: "idle",
  },
  {
    id: "c4",
    title: "Zsh prompt shows wrong git branch",
    project: "dotfiles",
    branch: "main",
    status: "idle",
  },
];

export const DONE_CHATS = [
  "Release notes for v0.8",
  "#35 Crash log tab copy button",
  "Rename LeftBar sections",
];

export type Status = "backlog" | "todo" | "in_progress" | "review" | "done";
export type Priority = "urgent" | "high" | "medium" | "low";
export type Effort = "XS" | "S" | "M" | "L" | "XL" | null;

export interface Task {
  number: number;
  title: string;
  status: Status;
  priority: Priority;
  effort: Effort;
  epic: string | null;
  isWorking?: boolean;
  elapsed?: string;
  hasChat?: boolean;
}

export interface Epic {
  name: string;
  color: "purple" | "blue" | "teal" | "orange" | "pink";
}

export const EPICS: Epic[] = [
  { name: "Astryx migration", color: "purple" },
  { name: "Project board", color: "blue" },
  { name: "ACP agents", color: "teal" },
  { name: "Terminal", color: "orange" },
];

export const COLUMNS: {
  id: Status;
  title: string;
  dot: "neutral" | "accent" | "warning" | "success";
}[] = [
  { id: "backlog", title: "Backlog", dot: "neutral" },
  { id: "todo", title: "Todo", dot: "neutral" },
  { id: "in_progress", title: "In progress", dot: "accent" },
  { id: "review", title: "Review", dot: "warning" },
  { id: "done", title: "Done", dot: "success" },
];

export const TASKS: Task[] = [
  { number: 47, title: "Board: keyboard moves between columns", status: "backlog", priority: "low", effort: "M", epic: "Project board" },
  { number: 48, title: "Copilot CLI: surface plan-mode exits", status: "backlog", priority: "medium", effort: "S", epic: "ACP agents" },
  { number: 46, title: "Tab drag preview follows the cursor", status: "backlog", priority: "low", effort: "XS", epic: null },
  { number: 44, title: "Astryx: side panel on the ide template", status: "todo", priority: "high", effort: "L", epic: "Astryx migration" },
  { number: 45, title: "Astryx: task view from work item detail", status: "todo", priority: "medium", effort: "M", epic: "Astryx migration" },
  { number: 43, title: "Terminal: scrollback search", status: "todo", priority: "medium", effort: "M", epic: "Terminal" },
  { number: 42, title: "Astryx: board on the kanban template", status: "in_progress", priority: "high", effort: "L", epic: "Astryx migration", isWorking: true, elapsed: "3:12", hasChat: true },
  { number: 41, title: "ACP: keep last model list when an agent times out", status: "in_progress", priority: "urgent", effort: "S", epic: "ACP agents", hasChat: true },
  { number: 40, title: "Terminal: honour code font size", status: "in_progress", priority: "medium", effort: "XS", epic: "Terminal", isWorking: true, elapsed: "0:48", hasChat: true },
  { number: 38, title: "Split Preferences into Chat / Fonts / Debug", status: "review", priority: "medium", effort: "S", epic: "Astryx migration", hasChat: true },
  { number: 39, title: "Board: Load older in Done", status: "review", priority: "low", effort: "XS", epic: "Project board", hasChat: true },
  { number: 37, title: "Astryx: replace overlays", status: "done", priority: "high", effort: "XL", epic: "Astryx migration", hasChat: true },
  { number: 36, title: "Board settings dialog", status: "done", priority: "medium", effort: "S", epic: "Project board", hasChat: true },
  { number: 35, title: "Crash log tab copy button", status: "done", priority: "low", effort: "XS", epic: null, hasChat: true },
];

export const PRIORITY_META: Record<
  Priority,
  { label: string; badge: "red" | "orange" | "yellow" | "neutral" }
> = {
  urgent: { label: "Urgent", badge: "red" },
  high: { label: "High", badge: "orange" },
  medium: { label: "Medium", badge: "yellow" },
  low: { label: "Low", badge: "neutral" },
};

export function epicColor(name: string | null) {
  return EPICS.find((e) => e.name === name)?.color ?? "gray";
}

export const FILE_TREE_PATHS = {
  root: "ai-leash",
};
