import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
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
import { cn, revealOnGroupHover } from "@/lib/utils";
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

// Sentinel for "no project filter", a real option so the selector shows
// "All projects" by name rather than an empty placeholder.
const ALL_PROJECTS = "all";

const styles = stylex.create({
  // Fills the header row beside the filter menu button.
  projectFilter: { flex: 1, minWidth: 0 },
});

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
        title={
          awaitingApproval
            ? `${projectName} — needs your approval`
            : awaitingAnswer
              ? `${projectName} — has a question for you`
              : projectName
        }
        className={cn(
          "group mx-1.5 mb-1.5 rounded-md text-sm",
          needsAttention
            ? "ring-1 ring-inset ring-amber-400/80 shadow-[0_0_10px_2px_rgba(251,191,36,0.45)]"
            : "",
        )}
      >
        <Item
          onClick={onClick}
          isSelected={active}
          label={
            <span className="flex w-full items-center gap-1.5">
              {conversation.taskNumber != null && (
                <span
                  title="Board task"
                  className="shrink-0 rounded bg-white/[0.06] px-1 text-[11px] tabular-nums text-zinc-400"
                >
                  #{conversation.taskNumber}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">
                {conversation.title || "New conversation"}
              </span>
            </span>
          }
          description={
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
                  <span
                    className="max-w-28 shrink-0 truncate"
                    title={branchName}
                  >
                    {branchName}
                  </span>
                </>
              )}
            </span>
          }
          endContent={
            <span className="flex h-7 items-center">
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
                  size="sm"
                  label="done"
                  tooltip="Mark as done"
                  icon={<Check size={12} />}
                  onClick={onMarkDone}
                  className={revealOnGroupHover}
                />
              ) : null}
            </span>
          }
        />
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
        title={conversation.title || "New conversation"}
        className="mx-1.5 rounded-md text-sm"
      >
        <Item
          density="compact"
          onClick={onClick}
          isSelected={active}
          label={conversation.title || "New conversation"}
          endContent={
            <IconButton
              variant="quiet"
              size="sm"
              label="Mark as not done"
              tooltip="Mark as not done"
              icon={<Undo2 size={14} />}
              onClick={(event) => {
                event.stopPropagation();
                onUndo();
              }}
            />
          }
        />
      </div>
    </ConversationContextMenu>
  );
}

const sectionStyles = stylex.create({
  root: {
    paddingBlockStart: spacingVars["--spacing-1-5"],
  },
  // The rule after the label runs out to the row's end.
  rule: {
    flexGrow: 1,
  },
});

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
      isOpen={!collapsed}
      onOpenChange={(open) => setCollapsed(section, !open)}
      chevronPosition="start"
      className={className}
      xstyle={sectionStyles.root}
      trigger={
        <HStack gap={1.5} align="center">
          <Text type="supporting" size="xsm" color="secondary">
            {label}
          </Text>
          <Divider xstyle={sectionStyles.rule} />
        </HStack>
      }
    >
      {children}
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
    <Item
      density="compact"
      onClick={onClick}
      isSelected={active}
      className="mx-1.5 mb-1 text-sm"
      startContent={<SquareKanban size={14} className="text-zinc-500" />}
      label={name}
      endContent={
        <span className="flex items-center gap-2">
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
        </span>
      }
    />
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
  // Same idea for Project boards: only boards in use show until expanded.
  const [boardsExpanded, setBoardsExpanded] = useState(false);
  const DEFAULT_VISIBLE_BOARDS = 5;

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
  // A board is "in use" once it has tasks or its project chat exists; the
  // rest (and in-use ones past the first few) sit behind "More boards". The
  // open board always stays visible.
  const isActiveBoard = (root: string) => {
    const chat = boardChatFor(root);
    return !!chat && chat.id === activeSessionId;
  };
  const inUseBoards = boardProjects.filter(
    (p) =>
      p.path === projectFilter ||
      boardSummaries.some((b) => b.projectRoot === p.path) ||
      !!boardChatFor(p.path),
  );
  const collapsedBoards = new Set(
    inUseBoards.slice(0, DEFAULT_VISIBLE_BOARDS).map((p) => p.path),
  );
  for (const p of boardProjects) {
    if (isActiveBoard(p.path)) collapsedBoards.add(p.path);
  }
  const visibleBoards = boardsExpanded
    ? boardProjects
    : boardProjects.filter((p) => collapsedBoards.has(p.path));
  const hiddenBoardCount = boardProjects.length - collapsedBoards.size;

  return (
    <div className="relative flex h-full flex-col bg-sunken">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/5 px-1.5 h-12">
        <Selector
          label="Project"
          isLabelHidden
          variant="ghost"
          size="sm"
          width="100%"
          containerXstyle={styles.projectFilter}
          value={projectFilter ?? ALL_PROJECTS}
          onChange={(value) =>
            setProjectFilter(value === ALL_PROJECTS ? null : value)
          }
          options={[
            { value: ALL_PROJECTS, label: "All projects" },
            ...recentProjects.map((p) => ({ value: p.path, label: p.name })),
          ]}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant="ghost"
              size="lg"
              label="Filters"
              tooltip="Filters"
              icon={<ListFilter size={17} />}
              className={cn(
                "shrink-0 text-zinc-500 hover:text-zinc-200",
                taskChats !== "all" && "text-primary-hover",
              )}
            />
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
        <IconButton
          variant="ghost"
          size="lg"
          label="Add project"
          tooltip="Add project"
          icon={<FolderPlus size={17} />}
          onClick={onAddProject}
          className="shrink-0 text-zinc-500 hover:text-zinc-200"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {boardProjects.length > 0 && (
          <SidebarSectionCollapsible section="boards" label="Project boards">
            {visibleBoards.map((p) => {
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
            {hiddenBoardCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                label={
                  boardsExpanded
                    ? "Show less"
                    : `More boards (${hiddenBoardCount})`
                }
                onClick={() => setBoardsExpanded((v) => !v)}
                className="mx-1.5 mb-1.5 flex items-center justify-start bg-transparent text-xs text-zinc-500 hover:bg-transparent hover:text-zinc-300"
              />
            )}
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
                label={
                  doneExpanded
                    ? "Show less"
                    : `Show all (${doneConversations.length})`
                }
                onClick={() => setDoneExpanded((v) => !v)}
                className="mx-1.5 mb-1.5 flex items-center justify-start bg-transparent text-xs text-zinc-500 hover:bg-transparent hover:text-zinc-300"
              />
            )}
          </SidebarSectionCollapsible>
        )}
      </div>
      <div className="shrink-0 border-t border-white/[0.06] p-2">
        <Button
          variant="ghost"
          label="Settings"
          tooltip="Settings"
          icon={<SettingsIcon size={15} />}
          onClick={() => setSettingsModalOpen(true)}
          className="w-full justify-start gap-2 text-zinc-500 hover:text-zinc-200"
        />
      </div>
      <DeleteConversationDialog
        conversation={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={deleteConversation}
      />
    </div>
  );
}
