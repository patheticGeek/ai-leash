import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { ContextMenu } from "@astryxdesign/core/ContextMenu";
import { Divider } from "@astryxdesign/core/Divider";
import {
  DropdownMenu,
  DropdownMenuGroup,
  type DropdownMenuOption,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { useContainerReveal } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { Kbd } from "@astryxdesign/core/Kbd";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import type { ResizableRegion } from "@astryxdesign/core/Resizable";
import {
  SideNav,
  SideNavCollapseButton,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, Stack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { listen } from "@tauri-apps/api/event";
import {
  Archive,
  Check,
  Folder,
  FolderMinus,
  FolderPlus,
  ListFilter,
  SettingsIcon,
  SquareKanban,
  SquarePen,
  Trash2,
  Undo2,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { type BoardSummary, useBoardSummaries } from "../data/board";
import { conversationLabel, useConversations } from "../data/conversations";
import { usePreference, useSetPreferences } from "../data/preferences";
import { BUILD_LABEL } from "../lib/buildChannel";
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
  type RecentProject,
  useAppStore,
} from "../store";
import DeleteConversationDialog from "./DeleteConversationDialog";
import { pickAndAddProject, startNewThread } from "./projectActions";
import RemoveProjectDialog from "./RemoveProjectDialog";
import type { SidebarCollapse } from "./sidebarCollapse";

const styles = stylex.create({
  // A collapsible SideNavItem lays its children out in a grid that takes the
  // rows' min-content width, so long titles push the end slots out of the
  // rail. Containing the inline size keeps the rows inside it.
  nested: { contain: "inline-size" },
  // The filter button stays lit while a task-chat filter is on.
  filterOn: { color: colorVars["--color-text-accent"] },
  showMore: { alignSelf: "flex-start" },
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
    <Text type="supporting" color="secondary" hasTabularNumbers>
      {formatDuration((now - startedAtMs) / 1000)}
    </Text>
  );
}

// A chat row's end slot: a warning dot while the agent waits on the user
// (pulsing for an approval), else elapsed time and a spinner while it works.
function ChatStatus({ conversationId }: { conversationId: string }) {
  const { active: generating, startedAtMs } = useGenerating(conversationId);
  const awaitingApproval = useAppStore(
    (s) => !!permissionForSession(s.pendingPermissions, conversationId),
  );
  const awaitingAnswer = useAppStore(
    (s) => !!elicitationForSession(s.pendingElicitations, conversationId),
  );
  if (awaitingApproval) {
    return (
      <StatusDot
        variant="warning"
        isPulsing
        label="Needs approval"
        tooltip="Waiting for you to approve an action"
      />
    );
  }
  if (awaitingAnswer) {
    return (
      <StatusDot
        variant="warning"
        label="Has a question"
        tooltip="Waiting for your answer"
      />
    );
  }
  if (generating) {
    return (
      <HStack gap={1.5} vAlign="center">
        {startedAtMs != null && <ElapsedTime startedAtMs={startedAtMs} />}
        <Spinner size="sm" aria-label="Working" />
      </HStack>
    );
  }
  return null;
}

// A sidebar row with its options in a `MoreMenu` revealed on hover/focus
// (the shell-side-nav template's ConversationItem), the same items on
// right-click.
function RevealRow({
  menuLabel,
  items,
  tooltip,
  children,
}: {
  menuLabel: string;
  items: DropdownMenuOption[];
  tooltip?: string;
  children: (actions: ReactNode) => ReactNode;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { getContainerProps, getContentRevealProps } = useContainerReveal();
  const row = (
    <ContextMenu label={menuLabel} menuWidth="auto" items={items}>
      <Stack
        {...getContainerProps({
          hoverDelay: 100,
          forceState: isMenuOpen ? "active" : undefined,
        })}
      >
        {children(
          // `isLayoutPreserved`: the ⋯ keeps its slot while hidden, so the
          // row's end content doesn't shift when it appears.
          <HStack
            as="span"
            {...getContentRevealProps({ isLayoutPreserved: true })}
          >
            <MoreMenu
              size="sm"
              label={menuLabel}
              onOpenChange={setIsMenuOpen}
              items={items}
            />
          </HStack>,
        )}
      </Stack>
    </ContextMenu>
  );
  if (!tooltip) return row;
  return (
    <Tooltip
      content={tooltip}
      placement="end"
      delay={600}
      hasHoverIndication={false}
    >
      {row}
    </Tooltip>
  );
}

function ConversationRow({
  conversation,
  projectName,
  isSelected,
  onClick,
  onDelete,
  onMarkDone,
}: {
  conversation: ConversationSummary;
  projectName: string;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onMarkDone: () => void;
}) {
  // Live — same watcher-backed hook `CheckoutBar` uses, so a branch switch
  // made from there (or from outside the app entirely) shows up here too.
  const checkoutPath = conversation.worktreePath ?? conversation.projectRoot;
  const branchName = useCurrentGitBranch(checkoutPath);
  const workspace = conversation.worktreePath
    ? (conversation.worktreePath.split(/[\\/]/).filter(Boolean).pop() ??
      conversation.worktreePath)
    : "primary";
  return (
    <RevealRow
      menuLabel="Conversation options"
      tooltip={[projectName, workspace, branchName].filter(Boolean).join(" · ")}
      items={[
        {
          label: "Mark as done",
          icon: <Check size={14} />,
          onClick: onMarkDone,
        },
        { type: "divider" },
        {
          label: "Delete conversation",
          icon: <Trash2 size={14} />,
          variant: "destructive",
          onClick: onDelete,
        },
      ]}
    >
      {(actions) => (
        <SideNavItem
          label={conversationLabel(conversation)}
          isSelected={isSelected}
          onClick={onClick}
          endContent={<ChatStatus conversationId={conversation.id} />}
          actions={actions}
        />
      )}
    </RevealRow>
  );
}

// Done conversations only show their title and a way back — see `LeftBar`'s
// Done group.
function DoneConversationRow({
  conversation,
  isSelected,
  onClick,
  onDelete,
  onUndo,
}: {
  conversation: ConversationSummary;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onUndo: () => void;
}) {
  return (
    <RevealRow
      menuLabel="Conversation options"
      items={[
        {
          label: "Mark as not done",
          icon: <Undo2 size={14} />,
          onClick: onUndo,
        },
        { type: "divider" },
        {
          label: "Delete conversation",
          icon: <Trash2 size={14} />,
          variant: "destructive",
          onClick: onDelete,
        },
      ]}
    >
      {(actions) => (
        <SideNavItem
          label={conversation.title || "New conversation"}
          isSelected={isSelected}
          onClick={onClick}
          actions={actions}
        />
      )}
    </RevealRow>
  );
}

// A project group's first row. The board is its board chat (`chatId`, once
// it exists), so the row spins while that chat works; the counts are tasks
// in progress (blue) and waiting for review (amber).
function BoardRow({
  summary,
  chatId,
  isSelected,
  onClick,
}: {
  summary: BoardSummary | undefined;
  chatId: string | undefined;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { active: generating } = useGenerating(chatId ?? "");
  const hasEnd = generating || !!summary?.inProgress || !!summary?.review;
  return (
    <SideNavItem
      label="Board"
      icon={SquareKanban}
      isSelected={isSelected}
      onClick={onClick}
      endContent={
        hasEnd ? (
          <HStack gap={1.5} vAlign="center">
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
        ) : undefined
      }
    />
  );
}

// A project group in the sidebar. Its header row has a ⋯ menu (Remove
// project) revealed on hover/focus — like a chat row's — and the same menu
// on right-click. Unlike `RevealRow`, the reveal and right-click are wired to
// the header row alone (via `SideNavItem`'s rest props, which land on its
// primary element), so pointing at or right-clicking one of the group's
// chats doesn't bring up the project's menu.
function ProjectGroup({
  project,
  isCollapsed,
  onCollapsedChange,
  onRemove,
  children,
}: {
  project: RecentProject;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const { getContainerProps, getContentRevealProps } = useContainerReveal();
  const focusProps = {
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  };
  return (
    <Stack
      {...getContainerProps({
        forceState:
          isMenuOpen || isHovered || isFocused ? "active" : "inactive",
      })}
    >
      <SideNavItem
        label={project.name}
        icon={Folder}
        collapsible={{ isCollapsed, onCollapsedChange }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          setIsMenuOpen(true);
        }}
        {...focusProps}
        actions={
          // `isLayoutPreserved`: the ⋯ keeps its slot while hidden, so the
          // collapse chevron never moves when it appears.
          <HStack
            as="span"
            {...getContentRevealProps({ isLayoutPreserved: true })}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            {...focusProps}
          >
            <MoreMenu
              size="sm"
              label="Project options"
              isMenuOpen={isMenuOpen}
              onOpenChange={setIsMenuOpen}
              items={[
                {
                  label: "Remove project",
                  icon: <FolderMinus size={14} />,
                  variant: "destructive",
                  onClick: onRemove,
                },
              ]}
            />
          </HStack>
        }
      >
        {children}
      </SideNavItem>
    </Stack>
  );
}

// Only the most recently done conversations show until "Show all", so a long
// backlog doesn't fill the open Done group.
const DEFAULT_VISIBLE_DONE = 5;

const basename = (path: string) =>
  path.split(/[\\/]/).filter(Boolean).pop() ?? path;

export default function LeftBar({
  resizable,
  collapse,
}: {
  // The sidebar's width and collapse state (`App.tsx`).
  resizable: ResizableRegion;
  // Shared with the title bar's expand toggle (`sidebarCollapse.ts`).
  collapse: SidebarCollapse;
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
  const [pendingRemove, setPendingRemove] = useState<RecentProject | null>(
    null,
  );
  const setConversationDone = useAppStore((s) => s.setConversationDone);
  const isNewThread = useAppStore((s) => s.draft !== null);
  const setSettingsModalOpen = useAppStore((s) => s.setSettingsModalOpen);
  const collapsedProjects = useAppStore((s) => s.sidebarCollapsedProjects);
  const setProjectCollapsed = useAppStore((s) => s.setSidebarProjectCollapsed);
  const isDoneOpen = useAppStore((s) => s.sidebarDoneOpen);
  const setDoneOpen = useAppStore((s) => s.setSidebarDoneOpen);
  const addPendingPermission = useAppStore((s) => s.addPendingPermission);
  const resolvePendingPermission = useAppStore(
    (s) => s.resolvePendingPermission,
  );
  const addPendingElicitation = useAppStore((s) => s.addPendingElicitation);
  const resolvePendingElicitation = useAppStore(
    (s) => s.resolvePendingElicitation,
  );
  const [doneExpanded, setDoneExpanded] = useState(false);
  // Idle projects (no open chats, no tasks, no board chat) sit behind
  // "More projects" while the sidebar is expanded.
  const [idleExpanded, setIdleExpanded] = useState(false);

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

  const isTaskChat = (c: ConversationSummary) => c.taskId !== null;
  const byRecency = (a: ConversationSummary, b: ConversationSummary) =>
    b.updatedAt - a.updatedAt;
  // Board chats show as their project's Board row, never as a chat row.
  const chats = conversations.filter(
    (c) => c.role !== "project" && !(taskChats === "hide" && isTaskChat(c)),
  );
  const openChats = chats.filter((c) => !c.done).sort(byRecency);
  const doneConversations = chats.filter((c) => c.done).sort(byRecency);
  const visibleDoneConversations = doneExpanded
    ? doneConversations
    : doneConversations.slice(0, DEFAULT_VISIBLE_DONE);

  // Known projects in their usual order, then any project a conversation
  // still points at that was forgotten from the list.
  const projects = [
    ...recentProjects,
    ...[...new Set(conversations.map((c) => c.projectRoot))]
      .filter((root) => !recentProjects.some((p) => p.path === root))
      .map((root) => ({ path: root, name: basename(root) })),
  ];
  const boardChatFor = (root: string) =>
    conversations.find((c) => c.role === "project" && c.projectRoot === root);
  const chatsFor = (root: string) => {
    const own = openChats.filter((c) => c.projectRoot === root);
    return taskChats === "top"
      ? [...own.filter(isTaskChat), ...own.filter((c) => !isTaskChat(c))]
      : own;
  };
  const isIdle = (root: string) =>
    chatsFor(root).length === 0 &&
    !boardSummaries.some((b) => b.projectRoot === root) &&
    !boardChatFor(root);
  // The rail shows every project's folder; expanded, idle ones fold away.
  const idleCount = projects.filter((p) => isIdle(p.path)).length;
  const visibleProjects =
    collapse.isCollapsed || idleExpanded
      ? projects
      : projects.filter((p) => !isIdle(p.path));

  return (
    <SideNav
      aria-label="Conversations"
      resizable={resizable}
      collapsible={{ hasButton: false }}
      header={
        // The collapse toggle sits beside the logo; the heading hides its end
        // slot while collapsed, when the toggle leads the title bar instead.
        <SideNavHeading
          heading="ai leash"
          icon={
            <Avatar
              src="/logo.svg"
              name="ai leash"
              size="sm"
              shape="rounded"
              tooltip={false}
            />
          }
          headerEndContent={
            <HStack gap={2} vAlign="center">
              {BUILD_LABEL && (
                <Token size="sm" color="orange" label={BUILD_LABEL} />
              )}
              <SideNavCollapseButton size="sm" label="Collapse sidebar" />
            </HStack>
          }
        />
      }
      footer={
        <SideNavSection title="App" isHeaderHidden>
          <SideNavItem
            label="Settings"
            icon={SettingsIcon}
            onClick={() => setSettingsModalOpen(true)}
          />
        </SideNavSection>
      }
    >
      {/* Same order as the shell-side-nav template: the menu, a rule, the
          projects, a rule, Done. */}
      <SideNavSection title="Menu" isHeaderHidden>
        <SideNavItem
          label="New thread"
          icon={SquarePen}
          isSelected={isNewThread}
          endContent={<Kbd keys="ctrl+n" />}
          onClick={() => void startNewThread()}
        />
        <SideNavItem
          label="Add project"
          icon={FolderPlus}
          onClick={() => void pickAndAddProject()}
        />
      </SideNavSection>
      <Divider />
      <SideNavSection
        title="Projects"
        endContent={
          <DropdownMenu
            placement="below"
            alignment="end"
            button={{
              label: "Filter the sidebar",
              variant: "ghost",
              size: "sm",
              icon: <Icon icon={ListFilter} size="sm" />,
              isIconOnly: true,
              xstyle: taskChats !== "all" ? styles.filterOn : undefined,
            }}
            hasChevron={false}
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
                <DropdownMenuRadioItem value="all" label="Mixed in" />
                <DropdownMenuRadioItem value="top" label="Grouped at the top" />
                <DropdownMenuRadioItem value="hide" label="Hidden" />
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenu>
        }
      >
        {projects.length === 0 && !collapse.isCollapsed && (
          <Text type="supporting" color="secondary">
            No projects yet
          </Text>
        )}
        {visibleProjects.map((p) => {
          const boardChat = boardChatFor(p.path);
          return (
            <ProjectGroup
              key={p.path}
              project={p}
              isCollapsed={collapsedProjects.includes(p.path)}
              onCollapsedChange={(collapsed) =>
                setProjectCollapsed(p.path, collapsed)
              }
              onRemove={() => setPendingRemove(p)}
            >
              <VStack gap={0.5} xstyle={styles.nested}>
                <BoardRow
                  summary={boardSummaries.find((b) => b.projectRoot === p.path)}
                  chatId={boardChat?.id}
                  isSelected={!!boardChat && boardChat.id === activeSessionId}
                  onClick={() => void openProjectBoard(p.path)}
                />
                {chatsFor(p.path).map((c) => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    projectName={p.name}
                    isSelected={c.id === activeSessionId}
                    onClick={() => openConversation(c.id)}
                    onDelete={() => setPendingDelete(c)}
                    onMarkDone={() => setConversationDone(c.id, true)}
                  />
                ))}
              </VStack>
            </ProjectGroup>
          );
        })}
        {!collapse.isCollapsed && idleCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            label={idleExpanded ? "Show less" : `More projects (${idleCount})`}
            onClick={() => setIdleExpanded((v) => !v)}
            xstyle={styles.showMore}
          />
        )}
      </SideNavSection>
      {doneConversations.length > 0 && (
        <>
          <Divider />
          <SideNavSection title="Done" isHeaderHidden>
            <SideNavItem
              label="Done"
              icon={Archive}
              collapsible={{
                isCollapsed: !isDoneOpen,
                onCollapsedChange: (collapsed) => setDoneOpen(!collapsed),
              }}
              endContent={
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {doneConversations.length}
                </Text>
              }
            >
              <VStack gap={0.5} xstyle={styles.nested}>
                {visibleDoneConversations.map((c) => (
                  <DoneConversationRow
                    key={c.id}
                    conversation={c}
                    isSelected={c.id === activeSessionId}
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
            </SideNavItem>
          </SideNavSection>
        </>
      )}
      <DeleteConversationDialog
        conversation={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={deleteConversation}
      />
      <RemoveProjectDialog
        project={pendingRemove}
        onClose={() => setPendingRemove(null)}
      />
    </SideNav>
  );
}
