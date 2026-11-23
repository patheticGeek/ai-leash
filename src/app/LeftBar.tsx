import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { ContextMenu } from "@astryxdesign/core/ContextMenu";
import { Divider } from "@astryxdesign/core/Divider";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import type { ResizableRegion } from "@astryxdesign/core/Resizable";
import { Selector } from "@astryxdesign/core/Selector";
import { SideNav } from "@astryxdesign/core/SideNav";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import {
  borderVars,
  colorVars,
  radiusVars,
  sizeVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Folder,
  FolderPlus,
  GitBranch,
  ListFilter,
  MessageCircleQuestion,
  SettingsIcon,
  ShieldAlert,
  SquareKanban,
  Trash2,
  Undo2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
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
  // The filter button stays lit while a task-chat filter is on.
  filterOn: { color: colorVars["--color-text-accent"] },
  settings: { justifyContent: "flex-start" },
  showMore: { alignSelf: "flex-start" },
  empty: { paddingBlock: spacingVars["--spacing-6"] },
});

const rowStyles = stylex.create({
  grow: { flex: 1, minWidth: 0 },
  branch: { flexShrink: 0, maxWidth: "7rem" },
  // The board task number chip before a task chat's title.
  taskNumber: {
    flexShrink: 0,
    paddingInline: spacingVars["--spacing-1"],
    borderRadius: radiusVars["--radius-inner"],
    backgroundColor: colorVars["--color-overlay-hover"],
  },
  // Keeps the end slot the height of a "done" button, so rows don't jump
  // when it appears under the pointer.
  status: { minHeight: sizeVars["--size-element-sm"] },
  working: { color: colorVars["--color-text-info"] },
  // A row whose agent is waiting on the user: an amber ring and glow.
  attention: {
    boxShadow: `inset 0 0 0 ${borderVars["--border-width"]} ${colorVars["--color-border-warning"]}, 0 0 ${spacingVars["--spacing-2"]} ${spacingVars["--spacing-0-5"]} color-mix(in srgb, ${colorVars["--color-icon-warning"]} 45%, transparent)`,
  },
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
    <Text type="supporting" size="xsm" color="inherit" hasTabularNumbers>
      {formatDuration((now - startedAtMs) / 1000)}
    </Text>
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
    <ContextMenu
      label="Conversation actions"
      menuWidth="auto"
      items={[
        {
          label: "Delete conversation",
          icon: <Trash2 size={14} />,
          variant: "destructive",
          onClick: onDelete,
        },
      ]}
    >
      {children}
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
    <Tooltip
      content={
        awaitingApproval
          ? `${projectName} — needs your approval`
          : awaitingAnswer
            ? `${projectName} — has a question for you`
            : projectName
      }
      placement="end"
      delay={600}
      hasHoverIndication={false}
    >
      <ConversationContextMenu onDelete={onDelete}>
        <Item
          // Mouse-only hover affordance that swaps the status icon for
          // "Mark as done". There's no keyboard equivalent yet (the context
          // menu only has delete), so keyboard users can't reach it.
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onClick={onClick}
          isSelected={active}
          xstyle={needsAttention ? rowStyles.attention : undefined}
          label={
            <HStack align="center" gap={1.5}>
              {conversation.taskNumber != null && (
                <Text
                  type="supporting"
                  size="xsm"
                  color="secondary"
                  hasTabularNumbers
                  aria-label={`Board task ${conversation.taskNumber}`}
                  xstyle={rowStyles.taskNumber}
                >
                  #{conversation.taskNumber}
                </Text>
              )}
              <Text maxLines={1} xstyle={rowStyles.grow}>
                {conversation.title || "New conversation"}
              </Text>
            </HStack>
          }
          description={
            <HStack align="center" gap={1}>
              <Icon icon={Folder} size="xsm" color="secondary" />
              <Text
                type="supporting"
                size="xsm"
                color="secondary"
                maxLines={1}
                xstyle={rowStyles.grow}
              >
                {projectAndWorkspace}
              </Text>
              {branchName && (
                <>
                  <Icon icon={GitBranch} size="xsm" color="secondary" />
                  <Text
                    type="supporting"
                    size="xsm"
                    color="secondary"
                    maxLines={1}
                    xstyle={rowStyles.branch}
                  >
                    {branchName}
                  </Text>
                </>
              )}
            </HStack>
          }
          endContent={
            <HStack align="center" xstyle={rowStyles.status}>
              {awaitingApproval ? (
                <Icon
                  icon={ShieldAlert}
                  size="sm"
                  color="warning"
                  label="Permission required"
                />
              ) : awaitingAnswer ? (
                <Icon
                  icon={MessageCircleQuestion}
                  size="sm"
                  color="warning"
                  label="Waiting for your answer"
                />
              ) : generating ? (
                <HStack align="center" gap={1} xstyle={rowStyles.working}>
                  {startedAtMs != null && (
                    <ElapsedTime startedAtMs={startedAtMs} />
                  )}
                  <Spinner size="sm" aria-label="Working" />
                </HStack>
              ) : hovering ? (
                <Button
                  variant="ghost"
                  size="sm"
                  label="done"
                  tooltip="Mark as done"
                  icon={<Check size={12} />}
                  onClick={onMarkDone}
                />
              ) : null}
            </HStack>
          }
        />
      </ConversationContextMenu>
    </Tooltip>
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
      <Item
        density="compact"
        onClick={onClick}
        isSelected={active}
        label={conversation.title || "New conversation"}
        endContent={
          <IconButton
            variant="ghost"
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
  children,
}: {
  section: SidebarSection;
  label: string;
  children: ReactNode;
}) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed[section]);
  const setCollapsed = useAppStore((s) => s.setSidebarSectionCollapsed);
  return (
    <Collapsible
      isOpen={!collapsed}
      onOpenChange={(open) => setCollapsed(section, !open)}
      chevronPosition="start"
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
      startContent={<Icon icon={SquareKanban} size="sm" color="secondary" />}
      label={name}
      endContent={
        <HStack align="center" gap={2}>
          {generating && <Spinner size="sm" aria-label="Working" />}
          {!!summary?.inProgress && (
            <Badge
              variant="info"
              label={summary.inProgress}
              aria-label={`${summary.inProgress} in progress`}
            />
          )}
          {!!summary?.review && (
            <Badge
              variant="warning"
              label={summary.review}
              aria-label={`${summary.review} in review`}
            />
          )}
        </HStack>
      }
    />
  );
}

export default function LeftBar({
  resizable,
}: {
  // The sidebar's width, shared with the title bar's corner above it.
  resizable: ResizableRegion;
}) {
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
    <SideNav
      aria-label="Conversations"
      resizable={resizable}
      header={
        <HStack align="center" gap={1}>
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
          <DropdownMenu
            placement="below"
            alignment="end"
            renderTrigger={(triggerProps) => (
              <IconButton
                {...triggerProps}
                variant="ghost"
                size="lg"
                label="Filters"
                tooltip="Filters"
                icon={<ListFilter size={17} />}
                xstyle={taskChats !== "all" ? styles.filterOn : undefined}
              />
            )}
          >
            <DropdownMenuGroup title="Task chats">
              <DropdownMenuRadioGroup
                label="Task chats"
                value={taskChats}
                onChange={(value) =>
                  setPreferences({
                    sidebarTaskChats: value as Preferences["sidebarTaskChats"],
                  })
                }
              >
                <DropdownMenuRadioItem value="all" label="Show all chats" />
                <DropdownMenuRadioItem
                  value="top"
                  label="Group task chats at top"
                />
                <DropdownMenuRadioItem value="hide" label="Hide task chats" />
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenu>
          <IconButton
            variant="ghost"
            size="lg"
            label="Add project"
            tooltip="Add project"
            icon={<FolderPlus size={17} />}
            onClick={onAddProject}
          />
        </HStack>
      }
      footer={
        <Button
          variant="ghost"
          label="Settings"
          tooltip="Settings"
          icon={<SettingsIcon size={15} />}
          onClick={() => setSettingsModalOpen(true)}
          width="100%"
          xstyle={styles.settings}
        />
      }
    >
      <VStack gap={3}>
        {boardProjects.length > 0 && (
          <SidebarSectionCollapsible section="boards" label="Project boards">
            <VStack gap={1}>
              {visibleBoards.map((p) => {
                const chat = boardChatFor(p.path);
                return (
                  <ProjectBoardRow
                    key={p.path}
                    name={p.name}
                    summary={boardSummaries.find(
                      (b) => b.projectRoot === p.path,
                    )}
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
                  xstyle={styles.showMore}
                />
              )}
            </VStack>
          </SidebarSectionCollapsible>
        )}
        <SidebarSectionCollapsible section="chats" label="Chats">
          <VStack gap={1.5}>
            {sortedConversations.length === 0 &&
              doneConversations.length === 0 && (
                <Text
                  type="supporting"
                  size="xsm"
                  color="secondary"
                  justify="center"
                  display="block"
                  xstyle={styles.empty}
                >
                  {projectFilter
                    ? "No conversations for this project"
                    : "No conversations yet"}
                </Text>
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
          </VStack>
        </SidebarSectionCollapsible>
        {doneConversations.length > 0 && (
          <SidebarSectionCollapsible section="done" label="Done">
            <VStack gap={0.5}>
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
                  xstyle={styles.showMore}
                />
              )}
            </VStack>
          </SidebarSectionCollapsible>
        )}
      </VStack>
      <DeleteConversationDialog
        conversation={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={deleteConversation}
      />
    </SideNav>
  );
}
