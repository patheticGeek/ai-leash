import { invoke } from "@tauri-apps/api/core";

export interface DirEntryInfo {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FontFamilyInfo {
  family: string;
  monospaced: boolean;
}

// Wire shape of Rust's `preferences::Preferences` (camelCase). Rust owns the
// defaults and clamps every write, so treat a value read back as authoritative.
export interface Preferences {
  composeMode: boolean;
  composerMaxRows: number;
  collapseFinishedTurns: boolean;
  ideCommand: string;
  debugModeEnabled: boolean;
  debugShowIds: boolean;
  uiFontFamily: string;
  uiFontSize: number;
  codeFontFamily: string;
  codeFontSize: number;
  // Where board task chats sit in the sidebar's chat list.
  sidebarTaskChats: "all" | "top" | "hide";
}

export interface PreferencesSnapshot {
  preferences: Preferences;
  // False until the first write, which is when leftover localStorage values
  // from before preferences moved to Rust get copied over (see
  // `data/preferences.ts`'s `bootPreferences`).
  persisted: boolean;
}

export interface ModelSummary {
  name: string;
  contextLength: number | null;
}

// One configured backend — Rust's `backend::registry::BackendConfig`.
// `model` on a native backend is the one last used on it, which is what a
// new conversation starts with.
export type BackendConfig = { id: string; label: string; enabled: boolean } & (
  | { kind: "ollama"; host: string; model: string }
  | {
      kind: "openAiCompatible";
      baseUrl: string;
      // Never sent back by Rust (the key lives in the OS keychain): always
      // "" from it. To Rust: a new key, or "" to keep the saved one.
      apiKey: string;
      apiKeySaved: boolean;
      model: string;
    }
  | { kind: "acp"; launchCommand: string }
);

// Every backend plus the one new conversations start on — Rust-owned
// (`backends.json`), payload of `backends://changed`.
export interface BackendRegistry {
  // Set when the keychain refused a key, which is then stored unencrypted
  // in the settings file instead. Only ever set by Rust.
  keyStorageError?: string | null;
  backends: BackendConfig[];
  defaultBackendId: string;
}

export interface PersistedToolCall {
  id: string | null;
  function: { name: string; arguments: unknown };
}

export interface PersistedMessage {
  id: number;
  role: string;
  content: string;
  toolCalls: PersistedToolCall[] | null;
  createdAt: number;
  durationSeconds: number | null;
  // Set when another conversation sent it (`board::messaging`): a message
  // from a task's chat or the project chat, or a note (`role: "event"`).
  fromConversationId: string | null;
}

// An ACP agent's "model" session config option (see
// docs/features/agent-chat.md) — most agents don't expose one.
export interface AcpModelOptions {
  id: string; // the agent's own SessionConfigId, opaque
  name: string;
  currentValue: string;
  options: { value: string; name: string }[];
}

export interface AcpEffortOptions {
  id: string;
  name: string;
  currentValue: string;
  options: { value: string; name: string }[];
}

// An ACP agent's own modes (its "mode" session config option — e.g. Claude
// Code's Default/Accept Edits/Plan Mode), shown in the permission picker in
// place of Ask/Bypass when the agent advertises them.
export interface AcpModeOptions {
  id: string;
  name: string;
  currentValue: string;
  options: { value: string; name: string; description: string | null }[];
}

// One entry of the ACP agent catalog — an enabled ACP backend plus the
// models/effort levels discovered for it. Rust builds it from the backend
// registry and keeps it fresh (`acp::sync_catalog_with_registry`).
export interface AcpAgentCatalogEntry {
  id: string;
  label: string;
  launchCommand: string;
  modelOptions: AcpModelOptions | null;
  effortOptions: AcpEffortOptions | null;
  modeOptions: AcpModeOptions | null;
}

// One slash command an ACP agent advertises. `hint` is the agent's
// placeholder text for the command's argument (e.g. "<file>"), null when
// the command takes no input.
export interface AcpCommandInfo {
  name: string;
  description: string;
  hint: string | null;
}

// What a conversation's live ACP connection offers — the payload of the
// global `acp://session-options` event (published whenever any part
// changes) and of `getAcpSessionOptions`. Every field null/false when the
// conversation has no connection; `connection` changes when a new one
// replaces it.
export interface AcpSessionOptions {
  sessionId: string;
  connection: number | null;
  launchCommand: string | null;
  // The agent has answered and the options below are what it offers.
  ready: boolean;
  model: AcpModelOptions | null;
  effort: AcpEffortOptions | null;
  mode: AcpModeOptions | null;
  commands: AcpCommandInfo[] | null;
}

// Payload of the global `permission://request` event — one listener for the
// whole app (see `LeftBar.tsx`), not per-session, since `sessionId` here is
// what routes it to the right project (see `permissionForSession` in
// `store.ts`). `sessionId` is the sub-agent's own id when the request came
// from one of its tool calls; `parentSessionId` is then the conversation that
// spawned it (null for a top-level conversation's own request).
export interface PermissionRequestPayload {
  id: string;
  sessionId: string;
  parentSessionId: string | null;
  kind: "shell" | "edit" | "acp";
  title: string;
  detail: string;
}

// One selectable value of an enum-like property (`oneOf`/`anyOf` entry).
export interface ElicitationEnumOption {
  const: string;
  title: string;
  description?: string;
}

// The subset of JSON Schema an ACP `elicitation/create` form may request —
// mirrors `ElicitationPropertySchema` in the protocol schema. Anything whose
// `type` isn't one of these arrives as the last, open-ended variant.
export type ElicitationPropertySchema =
  | {
      type: "string";
      title?: string;
      description?: string;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      format?: "email" | "uri" | "date" | "date-time";
      default?: string;
      enum?: string[];
      oneOf?: ElicitationEnumOption[];
    }
  | {
      type: "number" | "integer";
      title?: string;
      description?: string;
      minimum?: number;
      maximum?: number;
      default?: number;
    }
  | {
      type: "boolean";
      title?: string;
      description?: string;
      default?: boolean;
    }
  | {
      type: "array";
      title?: string;
      description?: string;
      minItems?: number;
      maxItems?: number;
      items:
        | { type: "string"; enum: string[] }
        | { anyOf: ElicitationEnumOption[] };
      default?: string[];
    }
  | {
      type: string;
      title?: string;
      description?: string;
      [key: string]: unknown;
    };

export interface ElicitationSchema {
  type: "object";
  title?: string;
  description?: string;
  properties: Record<string, ElicitationPropertySchema>;
  required?: string[];
}

// Payload of the global `elicitation://request` event — the agent asking the
// user a structured question mid-turn (ACP `elicitation/create`, form mode).
// Same routing as `PermissionRequestPayload`: one app-wide listener, and
// `sessionId` picks the project whose composer shows it.
export interface ElicitationRequestPayload {
  id: string;
  sessionId: string;
  message: string;
  schema: ElicitationSchema;
}

export type ElicitationContentValue = string | number | boolean | string[];

export type ElicitationAnswer =
  | { action: "accept"; content: Record<string, ElicitationContentValue> }
  | { action: "decline" }
  | { action: "cancel" };

export interface SubAgentSummary {
  id: string;
  parentSessionId: string;
  description: string;
  status: "running" | "done" | "error";
  startedAt: number; // epoch seconds, matches PersistedMessage.createdAt
  finishedAt: number | null;
  model: string;
  effort: string | null;
}

// One row of `list_conversations` — every top-level conversation across
// every known project (excludes sub-agent conversations, which have their
// own `SubAgentSummary`/Sub Agents sidebar instead).
export interface ConversationSummary {
  id: string;
  projectId: string | null;
  projectRoot: string;
  title: string | null;
  updatedAt: number; // epoch seconds, matches SubAgentSummary.startedAt
  // Sidebar organization only — see `setConversationDone`.
  done: boolean;
  // Non-null only when this conversation runs in a worktree instead of the
  // project's primary checkout — see `BranchBar`. Never a branch name: what
  // that path has checked out can change from outside the app, so the
  // frontend always reads it live (see `watchGitBranch`) instead of trusting
  // a stored value.
  worktreePath: string | null;
  // Persisted backend choice and Ask/Bypass mode — see
  // `store/selectionSlice.ts` and `store/permissionSlice.ts`. `backend` is
  // a backend id (`BackendConfig.id`); `model`/`effort`/`agentMode` are
  // meaningless without it.
  backend: string | null;
  model: string | null;
  effort: string | null;
  agentMode: string | null;
  permissionMode: string | null;
  // "project" for a project's board chat (shown as the board, not in the
  // chat list) — see `api.openProjectChat`.
  role: string | null;
  // The board task this conversation was started for, if any.
  taskId: string | null;
  taskNumber: number | null;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
}

export interface GitWorktree {
  path: string;
  branch: string | null;
  isPrimary: boolean;
}

export interface ProjectSummary {
  id: string;
  rootPath: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number | null;
}

// A run's output from byte `offset` on (`data` is base64) — the payload of
// `run://output` and the return of `runSnapshot`. See `run.rs`.
export interface RunOutputChunk {
  runId: string;
  offset: number;
  data: string;
}

export interface ActionSummary {
  id: string;
  name: string;
  command: string;
  running: boolean;
  startedAt: number | null;
  ptyId: string | null;
  // The current or most recent run (see `run.rs`) — kept after it ends, so
  // these also describe how the last run finished. All null if never run.
  runId: string | null;
  status: "running" | "exited" | "stopped" | null;
  exitCode: number | null;
  endedAt: number | null;
  // The action last run in this checkout — persisted, so it outlives a stop
  // or app restart (unlike `startedAt`). None is set if nothing has run yet
  // or that action was deleted.
  lastRun: boolean;
}

export type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "urgent" | "high" | "medium" | "low";
export type TaskEffort = "xs" | "s" | "m" | "l" | "xl";

// The agent a task's chat starts with — Rust's `db::AgentDefaults`. Any
// part may be unset, falling back to the board's, then the app's default.
// `model`, `thinking` and `agentMode` belong to `backendId`.
export interface AgentDefaults {
  backendId?: string | null;
  model?: string | null;
  // Reasoning effort.
  thinking?: string | null;
  // AI Leash's own Ask/Bypass.
  permissionMode?: "ask" | "bypass" | null;
  // An ACP agent's own mode, for agents that have modes.
  agentMode?: string | null;
}

// One card on a project's board — Rust's `db::Task`.
export interface Task {
  id: string;
  projectId: string;
  epicId: string | null;
  // Per-project `#N`, never reused.
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  effort: TaskEffort | null;
  // Order within its column (ascending).
  position: number;
  // The task's chat, once started.
  conversationId: string | null;
  engagedWithProject: boolean;
  createdAt: number; // epoch seconds
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  agent: AgentDefaults;
}

export interface Epic {
  id: string;
  projectId: string;
  title: string;
  description: string;
  color: string;
  position: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

// Everything one board shows — `get_board`.
export interface Board {
  tasks: Task[];
  epics: Epic[];
  // All done tasks, including the older ones `tasks` leaves out.
  doneCount: number;
  parallelMainCheckoutTasks: boolean;
  // What tasks start with when they don't say otherwise.
  agentDefaults: AgentDefaults;
}

export interface BoardSummary {
  projectRoot: string;
  backlog: number;
  todo: number;
  inProgress: number;
  review: number;
  done: number;
}

export interface NewTask {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  effort?: TaskEffort | null;
  epicId?: string | null;
  agent?: AgentDefaults;
}

// Absent fields are left alone; `null` clears `effort`/`epicId`.
export type TaskPatch = Partial<
  Pick<
    Task,
    "title" | "description" | "status" | "priority" | "effort" | "epicId"
  >
> & { agent?: AgentDefaults };

export interface NewEpic {
  title: string;
  description?: string;
  color?: string;
}

export type EpicPatch = Partial<
  Pick<Epic, "title" | "description" | "color" | "archived">
>;

// How to start a board task — all optional (Rust's `StartOptions`).
export interface StartTaskOptions {
  backendId?: string;
  model?: string;
  effort?: string | null;
  agentMode?: string | null;
  bypassPermissions?: boolean;
  engagedWithProject?: boolean;
}

// What removing a task's worktree would lose.
export interface WorktreeChanges {
  uncommitted: string[];
  unmergedCommits: string[];
}

export type FinishTaskOutcome =
  | { outcome: "done"; task: Task }
  | { outcome: "needsConfirmation"; changes: WorktreeChanges };

export const api = {
  // Returns the project's stable UUID (`db::ensure_project`'s id), created
  // the first time this path is opened and stable across renames of the
  // folder afterward — see `projectSlice.ts`'s `projectId`.
  setProjectRoot: (path: string) =>
    invoke<string>("set_project_root", { path }),
  getProjectRoot: () => invoke<string | null>("get_project_root"),
  // Locks in a conversation's own checkout — `cwd` is what its tools/shell/
  // ACP subprocess actually run in, `projectRoot` stays the primary repo
  // root either way (project identity). See `BranchBar`.
  setConversationRoot: (sessionId: string, projectRoot: string, cwd: string) =>
    invoke<void>("set_conversation_root", { sessionId, projectRoot, cwd }),
  // Shows `cwd` (file tree, session-less file/terminal commands) with no
  // conversation behind it — a still-unsent new thread's checkout.
  setViewRoot: (cwd: string) => invoke<void>("set_view_root", { cwd }),
  listGitBranches: (rootPath: string) =>
    invoke<GitBranch[]>("list_git_branches", { rootPath }),
  listGitWorktrees: (rootPath: string) =>
    invoke<GitWorktree[]>("list_git_worktrees", { rootPath }),
  getCurrentGitBranch: (rootPath: string) =>
    invoke<string | null>("get_current_git_branch", { rootPath }),
  // `baseBranch: null` attaches the worktree to an existing branch;
  // non-null creates `branch` fresh off `baseBranch` instead.
  createGitWorktree: (
    rootPath: string,
    branch: string,
    baseBranch: string | null,
  ) => invoke<string>("create_git_worktree", { rootPath, branch, baseBranch }),
  // `force: true` retries past "uncommitted changes" the plain form refuses.
  deleteGitWorktree: (rootPath: string, worktreePath: string, force: boolean) =>
    invoke<void>("delete_git_worktree", { rootPath, worktreePath, force }),
  // `force: true` retries past "not fully merged" the plain form refuses.
  deleteGitBranch: (rootPath: string, branch: string, force: boolean) =>
    invoke<void>("delete_git_branch", { rootPath, branch, force }),
  // Switches what's checked out at `worktreePath` — an existing `branch`
  // (`baseBranch: null`), or `branch` created fresh off `baseBranch`. Safe
  // at any point in a conversation's life, not just before its first
  // message — see `git.rs`'s doc comment.
  checkoutGitBranch: (
    worktreePath: string,
    branch: string,
    baseBranch: string | null,
  ) =>
    invoke<void>("checkout_git_branch", { worktreePath, branch, baseBranch }),
  // Starts watching `rootPath`'s current branch live — pair with a
  // `listen("git://branch_changed", ...)` subscription filtering on this
  // same path. A no-op if already watching it.
  watchGitBranch: (rootPath: string) =>
    invoke<void>("watch_git_branch", { rootPath }),
  // Scoped to the checkout path itself, not a session id — see
  // `commands.rs`'s `list_dir` doc comment.
  listDir: (checkoutPath: string, path?: string) =>
    invoke<DirEntryInfo[]>("list_dir", { checkoutPath, path }),
  // `sessionId` null: the checkout currently shown (a new thread's).
  readFileText: (sessionId: string | null, path: string) =>
    invoke<string>("read_file_text", { sessionId, path }),
  writeFileText: (sessionId: string | null, path: string, contents: string) =>
    invoke<void>("write_file_text", { sessionId, path, contents }),
  openInIde: (command: string, path: string) =>
    invoke<void>("open_in_ide", { command, path }),
  listSystemFonts: () => invoke<FontFamilyInfo[]>("list_system_fonts"),
  getPreferences: () => invoke<PreferencesSnapshot>("get_preferences"),
  setPreferences: (patch: Partial<Preferences>) =>
    invoke<Preferences>("set_preferences", { patch }),
  // Opens in whichever checkout `sessionId`'s conversation is pinned to
  // (primary or worktree), or with none (a new thread) the checkout
  // currently shown — see `pty.rs`'s doc comment.
  ptySpawn: (sessionId: string | null, cols: number, rows: number) =>
    invoke<string>("pty_spawn", { sessionId, cols, rows }),
  ptyWrite: (id: string, data: string) =>
    invoke<void>("pty_write", { id, data }),
  ptyResize: (id: string, cols: number, rows: number) =>
    invoke<void>("pty_resize", { id, cols, rows }),
  ptyKill: (id: string) => invoke<void>("pty_kill", { id }),
  getBackends: () =>
    invoke<BackendRegistry & { persisted: boolean }>("get_backends"),
  importBackends: (registry: BackendRegistry) =>
    invoke<BackendRegistry>("import_backends", { registry }),
  saveBackend: (config: BackendConfig) =>
    invoke<BackendRegistry>("save_backend", { config }),
  deleteBackend: (id: string) =>
    invoke<BackendRegistry>("delete_backend", { id }),
  setDefaultBackend: (id: string) =>
    invoke<BackendRegistry>("set_default_backend", { id }),
  listBackendModels: (backendId: string) =>
    invoke<ModelSummary[]>("list_backend_models", { backendId }),
  checkBackendConnection: (backendId: string) =>
    invoke<boolean>("check_backend_connection", { backendId }),
  loadConversationHistory: (sessionId: string) =>
    invoke<PersistedMessage[]>("load_conversation_history", { sessionId }),
  setMessageDuration: (sessionId: string, seconds: number) =>
    invoke<void>("set_message_duration", { sessionId, seconds }),
  getConversationTitle: (sessionId: string) =>
    invoke<string | null>("get_conversation_title", { sessionId }),
  setConversationTitle: (sessionId: string, title: string | null) =>
    invoke<void>("set_conversation_title", { sessionId, title }),
  setConversationDone: (sessionId: string, done: boolean) =>
    invoke<void>("set_conversation_done", { sessionId, done }),
  setConversationBackend: (
    sessionId: string,
    projectRoot: string,
    backend: string,
    model: string | null,
    effort: string | null,
    agentMode: string | null,
  ) =>
    invoke<void>("set_conversation_backend", {
      sessionId,
      projectRoot,
      selection: { backend, model, effort, agentMode },
    }),
  getBoard: (projectRoot: string, includeOlderDone: boolean) =>
    invoke<Board>("get_board", { projectRoot, includeOlderDone }),
  listBoardSummaries: () => invoke<BoardSummary[]>("list_board_summaries"),
  // The project's board chat id, created on first use.
  openProjectChat: (projectRoot: string) =>
    invoke<string>("open_project_chat", { projectRoot }),
  createTask: (projectRoot: string, task: NewTask) =>
    invoke<Task>("create_task", { projectRoot, task }),
  updateTask: (taskId: string, patch: TaskPatch) =>
    invoke<Task>("update_task", { taskId, patch }),
  // Into `status`, just before `beforeTaskId` (null: the end of the column).
  moveTask: (taskId: string, status: TaskStatus, beforeTaskId: string | null) =>
    invoke<Task>("move_task", { taskId, status, beforeTaskId }),
  deleteTask: (taskId: string) => invoke<void>("delete_task", { taskId }),
  // Gives the task its own worktree (git projects) and chat, and sends the
  // task as its first message. Resolves to the chat's conversation id.
  startTask: (taskId: string, options: StartTaskOptions) =>
    invoke<string>("start_task", { taskId, options }),
  // Moves the task to Done and removes its worktree — or, without `force`,
  // reports what that would lose instead of doing anything.
  finishTask: (taskId: string, beforeTaskId: string | null, force: boolean) =>
    invoke<FinishTaskOutcome>("finish_task", { taskId, beforeTaskId, force }),
  createEpic: (projectRoot: string, epic: NewEpic) =>
    invoke<Epic>("create_epic", { projectRoot, epic }),
  updateEpic: (epicId: string, patch: EpicPatch) =>
    invoke<Epic>("update_epic", { epicId, patch }),
  deleteEpic: (epicId: string) => invoke<void>("delete_epic", { epicId }),
  // Whether the project chat is woken by this task's updates — the task
  // chat's "Hand back to project chat".
  setTaskEngaged: (taskId: string, engaged: boolean) =>
    invoke<void>("set_task_engaged", { taskId, engaged }),
  setBoardAgentDefaults: (projectRoot: string, defaults: AgentDefaults) =>
    invoke<AgentDefaults>("set_board_agent_defaults", {
      projectRoot,
      defaults,
    }),
  setParallelMainCheckoutTasks: (projectRoot: string, allowed: boolean) =>
    invoke<void>("set_parallel_main_checkout_tasks", { projectRoot, allowed }),
  deleteProjectBoard: (projectRoot: string) =>
    invoke<void>("delete_project_board", { projectRoot }),
  clearConversation: (sessionId: string) =>
    invoke<void>("clear_conversation", { sessionId }),
  // Every chat operation names the backend by id; Rust resolves it.
  compactConversation: (sessionId: string, backendId: string, model: string) =>
    invoke<string>("compact_conversation", { sessionId, backendId, model }),
  sendPrompt: (
    sessionId: string,
    backendId: string,
    model: string,
    effort: string | null,
    agentMode: string | null,
    message: string,
  ) =>
    invoke<void>("send_prompt", {
      sessionId,
      backendId,
      model,
      effort,
      agentMode,
      message,
    }),
  retryLast: (
    sessionId: string,
    backendId: string,
    model: string,
    effort: string | null,
  ) => invoke<void>("retry_last", { sessionId, backendId, model, effort }),
  warmSession: (sessionId: string, backendId: string) =>
    invoke<void>("warm_session", { sessionId, backendId }),
  cancelPrompt: (sessionId: string) =>
    invoke<void>("cancel_prompt", { sessionId }),
  // The `!command` chat-input escape — runs `command` as a shell command
  // directly (no LLM turn, no permission prompt) and returns its output;
  // the backend also records it as a real tool-call/result pair (see
  // `run_shell_command` in `tools.rs`), so callers don't need to touch
  // `entries` themselves — the existing `tool_call`/`tool_result` listeners
  // in `ChatPanel.tsx` pick it up the same as a live agent turn would.
  runShellCommand: (sessionId: string, command: string) =>
    invoke<string>("run_shell_command", { sessionId, command }),
  getRateLimitResume: (sessionId: string) =>
    invoke<{ message: string; resetAt: number; armed: boolean } | null>(
      "get_rate_limit_resume",
      { sessionId },
    ),
  armRateLimitResume: (sessionId: string) =>
    invoke<void>("arm_rate_limit_resume", { sessionId }),
  dismissRateLimitResume: (sessionId: string) =>
    invoke<void>("dismiss_rate_limit_resume", { sessionId }),
  getAcpSessionOptions: (sessionId: string) =>
    invoke<AcpSessionOptions>("get_acp_session_options", { sessionId }),
  // Picks a model/effort/mode on the live connection (an ACP agent's own
  // config options).
  setSessionModel: (sessionId: string, value: string) =>
    invoke<void>("set_session_model", { sessionId, value }),
  setSessionEffort: (sessionId: string, value: string) =>
    invoke<void>("set_session_effort", { sessionId, value }),
  setSessionMode: (sessionId: string, value: string) =>
    invoke<void>("set_session_mode", { sessionId, value }),
  getAcpAgentCatalog: () =>
    invoke<AcpAgentCatalogEntry[]>("get_acp_agent_catalog"),
  listSubAgents: (sessionId: string) =>
    invoke<SubAgentSummary[]>("list_sub_agents", { sessionId }),
  deleteSubAgent: (subSessionId: string) =>
    invoke<void>("delete_sub_agent", { subSessionId }),
  listConversations: () => invoke<ConversationSummary[]>("list_conversations"),
  listProjects: () => invoke<ProjectSummary[]>("list_projects"),
  deleteConversation: (sessionId: string) =>
    invoke<void>("delete_conversation", { sessionId }),
  respondPermission: (id: string, approved: boolean) =>
    invoke<void>("respond_permission", { id, approved }),
  // `persist: false` only forces the flag off without touching the saved
  // choice — see `set_permission_mode`'s doc comment in permissions.rs. The
  // bypass flag itself always flips in memory either way.
  setPermissionMode: (
    sessionId: string,
    projectRoot: string,
    bypass: boolean,
    persist: boolean,
  ) =>
    invoke<void>("set_permission_mode", {
      sessionId,
      projectRoot,
      bypass,
      persist,
    }),
  respondElicitation: (id: string, answer: ElicitationAnswer) =>
    invoke<void>("respond_elicitation", { id, answer }),
  reportFrontendCrash: (kind: string, message: string, stack?: string) =>
    invoke<void>("report_frontend_crash", { kind, message, stack }),
  getCrashLog: () => invoke<string>("get_crash_log"),
  clearCrashLog: () => invoke<void>("clear_crash_log"),
  // Actions and their run status are scoped to a checkout path directly
  // (primary or worktree), not a session id — see `actions.rs`'s
  // `run_key` doc comment. Callers should pass the same resolved checkout
  // path they use as their React Query key (`useActions.ts`), not a
  // session id.
  listActions: (checkoutPath: string) =>
    invoke<ActionSummary[]>("list_actions", { checkoutPath }),
  createAction: (checkoutPath: string, name: string, command: string) =>
    invoke<{ id: string; name: string; command: string }>("create_action", {
      checkoutPath,
      name,
      command,
    }),
  updateAction: (
    checkoutPath: string,
    id: string,
    name: string,
    command: string,
  ) => invoke<void>("update_action", { checkoutPath, id, name, command }),
  deleteAction: (checkoutPath: string, id: string) =>
    invoke<void>("delete_action", { checkoutPath, id }),
  runAction: (checkoutPath: string, id: string) =>
    invoke<string>("run_action_cmd", { checkoutPath, id }),
  stopAction: (checkoutPath: string, id: string) =>
    invoke<string>("stop_action_cmd", { checkoutPath, id }),
  // Everything a run still holds — see `runOutput.ts` for how a terminal
  // stitches this together with live `run://output` chunks.
  runSnapshot: (runId: string) =>
    invoke<RunOutputChunk>("run_snapshot", { runId }),
};
