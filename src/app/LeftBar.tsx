import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ChevronDown,
  Folder,
  FolderPlus,
  GitBranch,
  ListFilter,
  Loader,
  MessageCircleQuestion,
  SettingsIcon,
  ShieldAlert,
  SquareKanban,
  Trash2,
  Undo2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, revealOnGroupHover } from "@/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { type BoardSummary, useBoardSummaries } from "../data/board";
import { useConversations } from "../data/conversations";
import { usePreference, useSetPreferences } from "../data/preferences";
import { formatDuration } from "../lib/format";
import { useGenerating } from "../lib/generatingQuery";
import type {
  ElicitationRequestPayload,
  PermissionRequestPayload,
  Preferences,
} from "../lib/tauriApi";
import { useCurrentGitBranch } from "../lib/useCurrentGitBranch";
import {
  type ConversationSummary,
  elicitationForSession,
  permissionForSession,
  type SidebarSection,
  useAppStore,
} from "../store";
import DeleteConversationDialog from "./DeleteConversationDialog";

// Sentinel for "no project filter" — Radix `Select` doesn't allow an empty
// string item value (that's reserved to mean "no selection").
const ALL_PROJECTS = "all";

// How long the row's turn has been running, next to its spinner. Ticks its
// own clock (like `WorkingForIndicator`) so only this label re-renders each
// second, and reads the same cross-remount `startedAtMs` the chat's "Working
// for" footer does, so the two agree.
function ElapsedTime({ startedAtMs }: { startedAtMs: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-xs tabular-nums">
      {formatDuration((now - startedAtMs) / 1000)}
    </span>
  );
}

// Right-click menu shared by both conversation row kinds.
function ConversationContextMenu({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem variant="danger" onSelect={onDelete}>
          <Trash2 />
          Delete conversation
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ConversationRow({
  conversation,
  projectName,
  active,
  onClick,
  onDelete,
  onMarkDone,
}: {
  conversation: ConversationSummary;
  projectName: string;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  onMarkDone: () => void;
}) {
  const { active: generating, startedAtMs } = useGenerating(conversation.id);
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const awaitingApproval = !!permissionForSession(
    pendingPermissions,
    conversation.id,
  );
  const pendingElicitations = useAppStore((s) => s.pendingElicitations);
  const awaitingAnswer = !!elicitationForSession(
    pendingElicitations,
    conversation.id,
  );
  const needsAttention = awaitingApproval || awaitingAnswer;
  const [hovering, setHovering] = useState(false);

  // Live — same watcher-backed hook `CheckoutBar` uses, so a branch switch
  // made from there (or from outside the app entirely) shows up here too,
  // not just a one-time snapshot from when the row first rendered.
  const checkoutPath = conversation.worktreePath ?? conversation.projectRoot;
  const branchName = useCurrentGitBranch(checkoutPath);

  const projectAndWorkspace =
    projectName +
    " / " +
    (conversation.worktreePath
      ? (conversation.worktreePath.split(/[\\/]/).filter(Boolean).pop() ??
        conversation.worktreePath)
      : "primary");

  return (
    <ConversationContextMenu onDelete={onDelete}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only
          hover affordance that swaps the status icon for "Mark as done".
          There's no keyboard equivalent yet (the context menu only has
          delete), so keyboard users can't reach it. */}
      <div
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn(
          "group mx-1.5 mb-1.5 flex items-center rounded-md text-sm transition-colors",
          active
            ? "bg-white/10 text-zinc-100"
            : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
          needsAttention
            ? "ring-1 ring-inset ring-amber-400/80 shadow-[0_0_10px_2px_rgba(251,191,36,0.45)]"
            : "",
        )}
      >
        <Button
          variant="unstyled"
          size="none"
          onClick={onClick}
          title={
            awaitingApproval
              ? `${projectName} — needs your approval`
              : awaitingAnswer
                ? `${projectName} — has a question for you`
                : projectName
          }
          className="flex min-w-0 flex-1 flex-col items-start text-left gap-0.5 px-3 py-2"
        >
          <span className="flex w-full items-center gap-1.5 mb-1.5 relative h-7">
            {conversation.taskNumber != null && (
              <span
                title="Board task"
                className="shrink-0 rounded bg-white/[0.06] px-1 text-[11px] tabular-nums text-zinc-400"
              >
                #{conversation.taskNumber}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-zinc-200">
              {conversation.title || "New conversation"}
            </span>

            <span>
              {awaitingApproval ? (
                <span
                  title="Permission required"
                  className="shrink-0 text-amber-400"
                >
                  <ShieldAlert size={12} />
                </span>
              ) : awaitingAnswer ? (
                <span
                  title="Waiting for your answer"
                  className="shrink-0 text-amber-400"
                >
                  <MessageCircleQuestion size={12} />
                </span>
              ) : generating ? (
                <span
                  title="Working"
                  className="flex shrink-0 items-center gap-1 text-blue-400"
                >
                  {startedAtMs != null && (
                    <ElapsedTime startedAtMs={startedAtMs} />
                  )}
                  <Loader size={12} className="animate-spin" />
                </span>
              ) : hovering ? (
                <Button
                  variant="success"
                  size="xs"
                  title="Mark as done"
                  onClick={onMarkDone}
                  className={cn("m-0", revealOnGroupHover)}
                >
                  <Check size={12} />
                  done
                </Button>
              ) : null}
            </span>
          </span>

          <span className="flex w-full items-center gap-1 text-xs text-zinc-500">
            <Folder className="size-2.5 shrink-0" />
            <span
              className="min-w-0 flex-1 truncate"
              title={projectAndWorkspace}
            >
              {projectAndWorkspace}
            </span>
            {branchName && (
              <>
                <GitBranch className="size-2.5 shrink-0" />
                <span className="max-w-28 shrink-0 truncate" title={branchName}>
                  {branchName}
                </span>
              </>
            )}
          </span>
        </Button>
      </div>
    </ConversationContextMenu>
  );
}

// Done conversations only show their title and a way back — see `LeftBar`'s
// "Done" section.
function DoneConversationRow({
  conversation,
  active,
  onClick,
  onDelete,
  onUndo,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  onUndo: () => void;
}) {
  return (
    <ConversationContextMenu onDelete={onDelete}>
      <div
        className={cn(
          "mx-1.5 flex items-stretch gap-2 rounded-md text-sm",
          active
            ? "bg-white/10 text-zinc-100"
            : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
        )}
      >
        <Button
          variant="unstyled"
          size="none"
          onClick={onClick}
          title={conversation.title || "New conversation"}
          className="min-w-0 flex-1 justify-start truncate text-left px-3 py-1.5"
        >
          {conversation.title || "New conversation"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Mark as not done"
          onClick={(event) => {
            event.stopPropagation();
            onUndo();
          }}
          className="shrink-0 text-zinc-500 hover:text-zinc-200 px-3"
        >
          <Undo2 size={14} />
        </Button>
      </div>
    </ConversationContextMenu>
  );
}

// A collapsible sidebar section. Its open state lives in the store
// (`sidebarSlice`) so it survives restarts and project-filter switches.
function SidebarSectionCollapsible({
  section,
  label,
  className,
  children,
}: {
  section: SidebarSection;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed[section]);
  const setCollapsed = useAppStore((s) => s.setSidebarSectionCollapsed);
  return (
    <Collapsible
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(section, !open)}
      className={className}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="unstyled"
          size="none"
          className="group/section mx-1.5 my-1.5 flex w-[calc(100%-0.75rem)] items-center justify-start gap-1.5 rounded-md px-3 text-xs font-medium text-zinc-600 hover:text-zinc-400"
        >
          <ChevronDown
            size={12}
            className="shrink-0 transition-transform group-data-[state=closed]/section:-rotate-90"
          />
          <span>{label}</span>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

// One project in the Project boards section. Its board is its board chat
// (`chatId`, once it exists), so the row lights up while that chat works.
function ProjectBoardRow({
  name,
  summary,
  chatId,
  active,
  onClick,
}: {
  name: string;
  summary: BoardSummary | undefined;
  chatId: string | undefined;
  active: boolean;
  onClick: () => void;
}) {
  const { active: generating } = useGenerating(chatId ?? "");
  return (
    <Button
      variant="unstyled"
      size="none"
      onClick={onClick}
      title={`${name} board`}
      className={cn(
        "mx-1.5 mb-1 flex w-[calc(100%-0.75rem)] items-center justify-start gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-white/10 text-zinc-100"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
      )}
    >
      <SquareKanban size={14} className="shrink-0 text-zinc-500" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {generating && (
        <Loader size={12} className="shrink-0 animate-spin text-blue-400" />
      )}
      {!!summary?.inProgress && (
        <span
          title={`${summary.inProgress} in progress`}
          className="shrink-0 rounded bg-blue-400/10 px-1 text-[11px] tabular-nums text-blue-400"
        >
          {summary.inProgress}
        </span>
      )}
      {!!summary?.review && (
        <span
          title={`${summary.review} in review`}
          className="shrink-0 rounded bg-warning/10 px-1 text-[11px] tabular-nums text-warning"
        >
          {summary.review}
        </span>
      )}
    </Button>
  );
}

export default function LeftBar() {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const conversations = useConversations();
  const recentProjects = useAppStore((s) => s.recentProjects);
  const openConversation = useAppStore((s) => s.openConversation);
  const openProjectBoard = useAppStore((s) => s.openProjectBoard);
  const boardSummaries = useBoardSummaries();
  const taskChats = usePreference("sidebarTaskChats");
  const setPreferences = useSetPreferences();
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const [pendingDelete, setPendingDelete] =
    useState<ConversationSummary | null>(null);
  const setConversationDone = useAppStore((s) => s.setConversationDone);
  const addProject = useAppStore((s) => s.addProject);
  const setSettingsModalOpen = useAppStore((s) => s.setSettingsModalOpen);
  const addPendingPermission = useAppStore((s) => s.addPendingPermission);
  const resolvePendingPermission = useAppStore(
    (s) => s.resolvePendingPermission,
  );
  const addPendingElicitation = useAppStore((s) => s.addPendingElicitation);
  const resolvePendingElicitation = useAppStore(
    (s) => s.resolvePendingElicitation,
  );
  // Which project's conversations to show — `null` (the default) means "all
  // projects, all conversations," matching the flat list this sidebar
  // already showed before this filter existed.
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  // "Show all"/"Show less" inside the open Done section — only the 3 most
  // recently-done conversations show until expanded, so a long "done" backlog doesn't push active
  // conversations out of view.
  const [doneExpanded, setDoneExpanded] = useState(false);
  const DEFAULT_VISIBLE_DONE = 3;

  async function onAddProject() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      await addProject(dir);
    }
  }

  // One global event carrying its own `sessionId` (see
  // `tools::request_permission`), same shape as `chat://generating` — so
  // this only needs one listener each, not one per known conversation.
  // Still lives here rather than e.g. `App.tsx` so it's colocated with the
  // other always-mounted, cross-conversation state this component already
  // owns.
  useEffect(() => {
    const unlistens = [
      listen<PermissionRequestPayload>("permission://request", (e) => {
        addPendingPermission(e.payload);
      }),
      listen<{ id: string }>("permission://resolved", (e) => {
        resolvePendingPermission(e.payload.id);
      }),
      listen<ElicitationRequestPayload>("elicitation://request", (e) => {
        addPendingElicitation(e.payload);
      }),
      listen<{ id: string }>("elicitation://resolved", (e) => {
        resolvePendingElicitation(e.payload.id);
      }),
    ];
    return () => {
      unlistens.forEach((u) => {
        u.then((f) => f());
      });
    };
  }, [
    addPendingPermission,
    resolvePendingPermission,
    addPendingElicitation,
    resolvePendingElicitation,
  ]);

  const filteredConversations = conversations.filter(
    (c) => !projectFilter || c.projectRoot === projectFilter,
  );
  // Board chats show as their board (Project boards, below), never as a
  // chat row.
  const chats = filteredConversations.filter((c) => c.role !== "project");
  const isTaskChat = (c: ConversationSummary) => c.taskId !== null;
  const byRecency = (a: ConversationSummary, b: ConversationSummary) =>
    b.updatedAt - a.updatedAt;
  const openChats = chats
    .filter((c) => !c.done && !(taskChats === "hide" && isTaskChat(c)))
    .sort(byRecency);
  const sortedConversations =
    taskChats === "top"
      ? [
          ...openChats.filter(isTaskChat),
          ...openChats.filter((c) => !isTaskChat(c)),
        ]
      : openChats;
  const doneConversations = chats
    .filter((c) => c.done && !(taskChats === "hide" && isTaskChat(c)))
    .sort(byRecency);
  const visibleDoneConversations = doneExpanded
    ? doneConversations
    : doneConversations.slice(0, DEFAULT_VISIBLE_DONE);
  const boardProjects = recentProjects.filter(
    (p) => !projectFilter || p.path === projectFilter,
  );
  const boardChatFor = (root: string) =>
    conversations.find((c) => c.role === "project" && c.projectRoot === root);

  return (
    <div className="relative flex h-full flex-col bg-sunken">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/5 px-1.5 h-12">
        <Select
          value={projectFilter ?? ALL_PROJECTS}
          onValueChange={(value) =>
            setProjectFilter(value === ALL_PROJECTS ? null : value)
          }
        >
          <SelectTrigger
            size="sm"
            className="h-auto! min-w-0 flex-1 border-none bg-transparent px-3 py-2 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          >
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent align="start" className="p-1">
            <SelectItem value={ALL_PROJECTS} className="px-3 py-2">
              All projects
            </SelectItem>
            {recentProjects.map((p) => (
              <SelectItem
                key={p.path}
                value={p.path}
                className="px-3 py-2 cursor-pointer"
              >
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              title="Filters"
              className={cn(
                "shrink-0 text-zinc-500 hover:text-zinc-200",
                taskChats !== "all" && "text-primary-hover",
              )}
            >
              <ListFilter size={17} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Task chats</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={taskChats}
              onValueChange={(value) =>
                setPreferences({
                  sidebarTaskChats: value as Preferences["sidebarTaskChats"],
                })
              }
            >
              <DropdownMenuRadioItem value="all">
                Show all chats
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="top">
                Group task chats at top
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="hide">
                Hide task chats
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-lg"
          title="Add project"
          onClick={onAddProject}
          className="shrink-0 text-zinc-500 hover:text-zinc-200"
        >
          <FolderPlus size={17} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {boardProjects.length > 0 && (
          <SidebarSectionCollapsible section="boards" label="Project boards">
            {boardProjects.map((p) => {
              const chat = boardChatFor(p.path);
              return (
                <ProjectBoardRow
                  key={p.path}
                  name={p.name}
                  summary={boardSummaries.find((b) => b.projectRoot === p.path)}
                  chatId={chat?.id}
                  active={!!chat && chat.id === activeSessionId}
                  onClick={() => void openProjectBoard(p.path)}
                />
              );
            })}
          </SidebarSectionCollapsible>
        )}
        <SidebarSectionCollapsible
          section="chats"
          label="Chats"
          className="mt-3"
        >
          {sortedConversations.length === 0 &&
            doneConversations.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-zinc-600">
                {projectFilter
                  ? "No conversations for this project"
                  : "No conversations yet"}
              </div>
            )}
          {sortedConversations.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              projectName={
                recentProjects.find((p) => p.path === c.projectRoot)?.name ??
                c.projectRoot
              }
              active={c.id === activeSessionId}
              onClick={() => openConversation(c.id)}
              onDelete={() => setPendingDelete(c)}
              onMarkDone={() => setConversationDone(c.id, true)}
            />
          ))}
        </SidebarSectionCollapsible>
        {doneConversations.length > 0 && (
          <SidebarSectionCollapsible
            section="done"
            label="Done"
            className="mt-3"
          >
            {visibleDoneConversations.map((c) => (
              <DoneConversationRow
                key={c.id}
                conversation={c}
                active={c.id === activeSessionId}
                onClick={() => openConversation(c.id)}
                onDelete={() => setPendingDelete(c)}
                onUndo={() => setConversationDone(c.id, false)}
              />
            ))}
            {doneConversations.length > DEFAULT_VISIBLE_DONE && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDoneExpanded((v) => !v)}
                className="mx-1.5 mb-1.5 flex items-center justify-start bg-transparent text-xs text-zinc-500 hover:bg-transparent hover:text-zinc-300"
              >
                {doneExpanded
                  ? "Show less"
                  : `Show all (${doneConversations.length})`}
              </Button>
            )}
          </SidebarSectionCollapsible>
        )}
      </div>
      <div className="shrink-0 border-t border-white/[0.06] p-2">
        <Button
          variant="ghost"
          size="md"
          title="Settings"
          onClick={() => setSettingsModalOpen(true)}
          className="w-full justify-start gap-2 text-zinc-500 hover:text-zinc-200"
        >
          <SettingsIcon size={15} />
          Settings
        </Button>
      </div>
      <DeleteConversationDialog
        conversation={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={deleteConversation}
      />
    </div>
  );
}
