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
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { useContainerReveal } from "@astryxdesign/core/hooks";
import { Icon } from "@astryxdesign/core/Icon";
import { Item } from "@astryxdesign/core/Item";
import { Kbd } from "@astryxdesign/core/Kbd";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
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
import {
  borderVars,
  colorVars,
  sizeVars,
  spacingVars,
  textSizeVars,
  typeScaleVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { listen } from "@tauri-apps/api/event";
import {
  Archive,
  Check,
  Folder,
  FolderMinus,
  FolderPlus,
  ListFilter,
  MessagesSquare,
  QuestionMark,
  SettingsIcon,
  ShieldAlert,
  SquareKanban,
  SquarePen,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type BoardSummary,
  STATUS_LABELS,
  useBoard,
  useBoardSummaries,
} from "../data/board";
import { conversationLabel, useConversations } from "../data/conversations";
import { usePreference, useSetPreferences } from "../data/preferences";
import { PriorityBadge, STATUS_DOT } from "../features/board/TaskMeta";
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
  // The hairline between the sidebar and the rest of the window, full
  // height. AppShell draws one only in its `section` variant, which would
  // also drop the elevated variant's colours (#42), and the theme has no
  // side-nav border to set, so it's drawn here.
  rail: {
    borderInlineEndWidth: borderVars["--border-width"],
    borderInlineEndStyle: "solid",
    borderInlineEndColor: colorVars["--color-border"],
  },
  // A collapsible SideNavItem lays its children out in a grid that takes the
  // rows' min-content width, so long titles push the end slots out of the
  // rail. Containing the inline size keeps the rows inside it.
  nested: { contain: "inline-size" },
  // The filter button stays lit while a task-chat filter is on.
  filterOn: { color: colorVars["--color-text-accent"] },
  // A flat-layout chat row's label (an `Item`, not a `SideNavItem`); the
  // size is the side-nav-section's 14px, the colours follow side-nav-item.
  rowLabel: {
    fontSize: typeScaleVars["--text-supporting-size"],
    color: {
      default: colorVars["--color-text-secondary"],
      [stylex.when.ancestor(":hover")]: colorVars["--color-text-primary"],
    },
  },
  rowLabelOn: { color: colorVars["--color-text-primary"] },
  flatTitle: { minWidth: 0, flexShrink: 1 },
  // Holds the title line's room for the ⋯ while it shows. The ⋯ itself can't
  // sit in the title line (that's inside the row's button), so it's laid over
  // the row's end from outside the Item (`flatActions`), out of the flow, and
  // the second line keeps the row's full width. The slot is the whole ⋯
  // button, so its hit area never covers the status before it.
  flatActionsSlot: { width: sizeVars["--size-element-sm"], flexShrink: 0 },
  flatActions: {
    position: "absolute",
    insetInlineEnd: `calc(${spacingVars["--spacing-1"]} + ${spacingVars["--spacing-0-5"]})`,
    // On the title line's centre: `RevealedActions` has no height of its
    // own and centres the ⋯ on itself.
    insetBlockStart: `calc(${spacingVars["--spacing-1"]} + 1lh / 2)`,
  },
  // Second line: the project truncates first; the branch keeps its place on
  // the right (capped so a very long one can't push the project out).
  projectName: { minWidth: 0, flexShrink: 1 },
  branchName: { flexShrink: 0, maxWidth: "60%" },
  // The open Done list lives in the side nav's footer, which doesn't scroll
  // or shrink, so it scrolls on its own past a third of the window rather
  // than squeezing the projects out ("Show all" can be long).
  doneList: { maxHeight: "33vh", overflowY: "auto" },
  // The side nav's scroll area is one column the height of the area, so
  // the section titles stay put and only the lists under them scroll
  // (`fillSection`, `ScrollList`). On the icon rail the area scrolls as a
  // whole, as before, and its items stay centred.
  navFill: { height: "100%", minHeight: 0 },
  navRail: { alignSelf: "stretch", alignItems: "center" },
  // A Projects/Chats section: its title in a fixed row, its list in a row
  // that takes what's left and may shrink to nothing (a grid row's `0`
  // minimum, where a flex item would keep its content's height).
  fillSection: {
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    gridTemplateColumns: "minmax(0, 1fr)",
    minHeight: 0,
    flexShrink: 1,
  },
  scrollFrame: { position: "relative", minHeight: 0, flexShrink: 1 },
  // Out into the side nav's inline padding, so focus rings at the rows'
  // edges aren't clipped by the scroll box.
  scrollViewport: {
    minHeight: 0,
    flexShrink: 1,
    overflowY: "auto",
    overflowX: "hidden",
    marginInline: `calc(-1 * ${spacingVars["--spacing-2"]})`,
    paddingInline: spacingVars["--spacing-2"],
  },
  // A fade at a list's top or bottom edge while there's more scrolled out
  // of view that way, like the chat transcript's top fade: the side nav's
  // background (AppShell's nav wash) to transparent.
  scrollFade: {
    position: "absolute",
    insetInline: `calc(-1 * ${spacingVars["--spacing-2"]})`,
    height: spacingVars["--spacing-6"],
    zIndex: 1,
    pointerEvents: "none",
    opacity: 0,
    transitionProperty: "opacity",
    transitionDuration: "150ms",
  },
  scrollFadeTop: {
    insetBlockStart: 0,
    backgroundImage: `linear-gradient(to bottom, ${colorVars["--color-background-body"]}, transparent)`,
  },
  scrollFadeBottom: {
    insetBlockEnd: 0,
    backgroundImage: `linear-gradient(to top, ${colorVars["--color-background-body"]}, transparent)`,
  },
  scrollFadeShown: { opacity: 1 },
  // "More projects" / "Show all" / "Show less": muted like an at-rest
  // sidebar row, primary on hover, one type-scale step (12px) below the rows
  // so they don't read as another project or chat. The theme can't single
  // out buttons in the side nav (`editor how "muted ghost buttons in the side
  // nav"`), so this is the one row that sets it.
  showMore: {
    alignSelf: "flex-start",
    color: {
      default: colorVars["--color-text-secondary"],
      ":hover": colorVars["--color-text-primary"],
    },
    fontSize: textSizeVars["--font-size-sm"],
  },
  // The ⋯ never takes its full width from the title: it's out of the flow,
  // anchored at the slot's end edge (which also keeps it inside the rail
  // instead of overflowing past it and scrolling the sidebar sideways), and
  // centred on the slot. At rest the slot is empty; revealed it's the
  // button's full width, so the title gives up that (plus the row's gap) and
  // the button's padding never lies over the spinner or timer before it. The
  // flat row's title line reserves the same (`flatActionsSlot`), so both
  // layouts cut it alike.
  revealAnchor: { position: "relative", alignItems: "center" },
  revealAnchorOpen: { width: sizeVars["--size-element-sm"] },
  // The row wrapper: anchors a flat row's ⋯ and marks hover for the flat
  // row's label colour (the ⋯ is outside the Item, so the Item can't).
  revealRow: { position: "relative" },
  revealEnd: { position: "absolute", insetInlineEnd: 0 },
  // The working timer, in the theme's blue (its accent is neutral, so
  // `color="accent"` would be white). Never shrinks, so it stays on one line
  // and only the title gives way. One type-scale step (12px) below the
  // title: it's `supporting` text, but the side-nav-section raises
  // `--text-supporting-size` to the title's 14px, so it sets the step itself.
  working: {
    color: colorVars["--color-text-blue"],
    flexShrink: 0,
    fontSize: textSizeVars["--font-size-sm"],
  },
  attention: { flexShrink: 0, display: "inline-flex" },
  // The row's hover card: wide enough for a long title or path to wrap
  // over a few lines rather than one per word.
  hoverCard: { maxWidth: "44ch" },
  hoverCardText: { overflowWrap: "anywhere" },
  // A nested side-nav row is indented one `--spacing-6` step, the width of
  // the parent's icon plus the row's gap (16px + `--spacing-2`); pulling the
  // icon back by that puts it in the indent, under the folder icon, and
  // leaves the title where it was.
  attentionInIndent: {
    marginInlineStart: `calc(-1 * ${spacingVars["--spacing-6"]})`,
  },
});

// A row's ⋯ slot: empty at rest (so the title keeps the full row), about the
// dots' width while revealed — see `revealAnchor`.
function RevealedActions({
  revealProps,
  isRevealed,
  children,
}: {
  revealProps: ReturnType<
    ReturnType<typeof useContainerReveal>["getContentRevealProps"]
  >;
  isRevealed: boolean;
  children: ReactNode;
}) {
  return (
    <HStack
      as="span"
      xstyle={[styles.revealAnchor, isRevealed && styles.revealAnchorOpen]}
    >
      <HStack as="span" {...revealProps} xstyle={styles.revealEnd}>
        {children}
      </HStack>
    </HStack>
  );
}

// How long the row's turn has been running, in blue at the row's end (the
// row's only working indicator). Ticks its own clock (like
// `WorkingForIndicator`) so only this label re-renders each second, and
// reads the same cross-remount `startedAtMs` the chat's "Working for" footer
// does, so the two agree.
function ElapsedTime({ conversationId }: { conversationId: string }) {
  const { active, startedAtMs } = useGenerating(conversationId);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);

  if (!active || startedAtMs == null) return null;
  return (
    <Text
      type="supporting"
      textWrap="nowrap"
      hasTabularNumbers
      xstyle={styles.working}
    >
      {formatDuration((now - startedAtMs) / 1000)}
    </Text>
  );
}

// A warning icon at the start of a chat row saying what the chat needs from
// the user: a shield for an approval, a question mark for a question. In
// the grouped layout it sits in the row's nesting indent (`inIndent`), under
// the project's folder icon, so the title doesn't move.
function ChatAttention({
  conversationId,
  inIndent = false,
}: {
  conversationId: string;
  inIndent?: boolean;
}) {
  const awaitingApproval = useAppStore(
    (s) => !!permissionForSession(s.pendingPermissions, conversationId),
  );
  const awaitingAnswer = useAppStore(
    (s) => !!elicitationForSession(s.pendingElicitations, conversationId),
  );
  if (!awaitingApproval && !awaitingAnswer) return null;
  // No tooltip of its own: the row's hover card says what it's waiting for.
  const [icon, label] = awaitingApproval
    ? [ShieldAlert, "Needs approval"]
    : [QuestionMark, "Has a question"];
  return (
    <HStack
      as="span"
      xstyle={[styles.attention, inIndent && styles.attentionInIndent]}
    >
      <Icon icon={icon} size="sm" color="warning" label={label} />
    </HStack>
  );
}

// The board task a chat was started for, from its project's board (cached
// with the board view's query). Only mounted while the hover card is open.
function HoverCardTask({
  projectRoot,
  taskId,
}: {
  projectRoot: string;
  taskId: string;
}) {
  const task = useBoard(projectRoot, false)?.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  return (
    <>
      <Divider />
      {/* Status, effort and priority as separate items with room between
          them, rather than one run-on line. */}
      <HStack gap={4} vAlign="center" wrap="wrap">
        <HStack gap={1.5} vAlign="center">
          <StatusDot
            variant={STATUS_DOT[task.status]}
            label={STATUS_LABELS[task.status]}
          />
          <Text type="supporting" color="secondary">
            {STATUS_LABELS[task.status]}
          </Text>
        </HStack>
        {task.effort && (
          <Text type="supporting" color="secondary">
            Effort {task.effort.toUpperCase()}
          </Text>
        )}
        <PriorityBadge priority={task.priority} />
      </HStack>
    </>
  );
}

// What hovering a chat row shows: its whole title, where it runs, what it's
// waiting for, and its task's status, effort and priority when it's a task's
// chat. One card
// instead of a tooltip per part of the row.
function ConversationHoverCard({
  conversation,
  projectName,
  workspace,
  branchName,
}: {
  conversation: ConversationSummary;
  projectName: string;
  workspace: string;
  branchName: string | null;
}) {
  const awaitingApproval = useAppStore(
    (s) => !!permissionForSession(s.pendingPermissions, conversation.id),
  );
  const awaitingAnswer = useAppStore(
    (s) => !!elicitationForSession(s.pendingElicitations, conversation.id),
  );
  return (
    <VStack gap={3}>
      <Text weight="medium" xstyle={styles.hoverCardText}>
        {conversationLabel(conversation)}
      </Text>
      {(awaitingApproval || awaitingAnswer) && (
        <HStack gap={1.5} vAlign="center">
          <Icon
            icon={awaitingApproval ? ShieldAlert : QuestionMark}
            size="sm"
            color="warning"
          />
          <Text type="supporting">
            {awaitingApproval
              ? "Waiting for you to approve an action"
              : "Waiting for your answer"}
          </Text>
        </HStack>
      )}
      <MetadataList>
        <MetadataListItem label="Project">
          <Text xstyle={styles.hoverCardText}>{projectName}</Text>
        </MetadataListItem>
        <MetadataListItem label="Worktree">
          <Text xstyle={styles.hoverCardText}>{workspace}</Text>
        </MetadataListItem>
        {branchName && (
          <MetadataListItem label="Branch">
            <Text xstyle={styles.hoverCardText}>{branchName}</Text>
          </MetadataListItem>
        )}
      </MetadataList>
      {conversation.taskId && (
        <HoverCardTask
          projectRoot={conversation.projectRoot}
          taskId={conversation.taskId}
        />
      )}
    </VStack>
  );
}

// A sidebar row with its options in a `MoreMenu` revealed on hover/focus
// (the shell-side-nav template's ConversationItem), the same items on
// right-click. At rest the ⋯ takes no space, so the title uses the whole
// row and the row's end content (status, counts) sits at its end. On
// hover/focus, or while the menu is open, the ⋯ joins it: SideNavItem
// renders `endContent` inside the row's button and `actions` after it, so it
// reads status, then ⋯. Nothing is hidden for it; only the title truncates
// sooner. `isRevealed` tells the row the ⋯ is showing (the flat chat row
// reserves its room in the title line). The hover/focus state is tracked here
// (not left to the hook's CSS) so the ⋯ and that room change together.
function RevealRow({
  menuLabel,
  items,
  hoverCard,
  children,
}: {
  menuLabel: string;
  items: DropdownMenuOption[];
  hoverCard?: ReactNode;
  children: (slots: { actions: ReactNode; isRevealed: boolean }) => ReactNode;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isActive = isMenuOpen || isHovered || isFocused;
  const { getContainerProps, getContentRevealProps } = useContainerReveal();
  const row = (
    <ContextMenu label={menuLabel} menuWidth="auto" items={items}>
      <Stack
        {...getContainerProps({
          forceState: isActive ? "active" : "inactive",
        })}
        xstyle={[stylex.defaultMarker(), styles.revealRow]}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        {children({
          actions: (
            <RevealedActions
              revealProps={getContentRevealProps()}
              isRevealed={isActive}
            >
              <MoreMenu
                size="sm"
                label={menuLabel}
                onOpenChange={setIsMenuOpen}
                items={items}
              />
            </RevealedActions>
          ),
          isRevealed: isActive,
        })}
      </Stack>
    </ContextMenu>
  );
  if (!hoverCard) return row;
  // Not while its menu is open, so the card doesn't sit over the menu.
  return (
    <HoverCard
      content={hoverCard}
      placement="end"
      alignment="start"
      delay={600}
      focusTrigger="never"
      isEnabled={!isMenuOpen}
      hasHoverIndication={false}
      xstyle={styles.hoverCard}
    >
      {row}
    </HoverCard>
  );
}

// In the flat layout (`hasProjectLine`) the row adds a second line,
// project · branch, since no project group header says which project it's
// from. `SideNavItem` takes a string label only, so that row is Astryx's
// two-line `Item` instead.
function ConversationRow({
  conversation,
  projectName,
  hasProjectLine,
  isSelected,
  onClick,
  onDelete,
  onMarkDone,
}: {
  conversation: ConversationSummary;
  projectName: string;
  hasProjectLine: boolean;
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
    : "Project checkout";
  return (
    <RevealRow
      menuLabel="Conversation options"
      hoverCard={
        <ConversationHoverCard
          conversation={conversation}
          projectName={projectName}
          workspace={workspace}
          branchName={branchName}
        />
      }
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
      {({ actions, isRevealed }) => {
        const status = <ElapsedTime conversationId={conversation.id} />;
        return hasProjectLine ? (
          <>
            <Item
              // Styled like a side-nav-item row (the theme's side-nav-item
              // settings don't reach Item, and an `item` theme change would
              // hit every menu and list): 14px weight-500 label, secondary at
              // rest and primary when hovered or selected; the description a
              // step smaller, muted: project on the left, branch on the right.
              // The status and ⋯ sit on the title line, so only the title
              // truncates for them and the second line keeps the full width.
              label={
                <HStack gap={1.5} vAlign="center">
                  <ChatAttention conversationId={conversation.id} />
                  <Text
                    weight="medium"
                    maxLines={1}
                    hasTruncateTooltip={false}
                    xstyle={[
                      styles.rowLabel,
                      styles.flatTitle,
                      isSelected && styles.rowLabelOn,
                    ]}
                  >
                    {conversationLabel(conversation)}
                  </Text>
                  {status}
                  {isRevealed && (
                    <HStack as="span" xstyle={styles.flatActionsSlot}>
                      {null}
                    </HStack>
                  )}
                </HStack>
              }
              description={
                <HStack gap={2} hAlign="between" vAlign="center">
                  <Text
                    type="supporting"
                    size="sm"
                    color="secondary"
                    maxLines={1}
                    hasTruncateTooltip={false}
                    xstyle={styles.projectName}
                  >
                    {projectName}
                  </Text>
                  {branchName && (
                    <Text
                      type="supporting"
                      size="sm"
                      color="secondary"
                      maxLines={1}
                      hasTruncateTooltip={false}
                      xstyle={styles.branchName}
                    >
                      {branchName}
                    </Text>
                  )}
                </HStack>
              }
              isSelected={isSelected}
              onClick={onClick}
            />
            {/* Outside the Item (no end slot, so no gap before one), over the
              title line's reserved slot. */}
            <HStack as="span" xstyle={styles.flatActions}>
              {actions}
            </HStack>
          </>
        ) : (
          <SideNavItem
            label={conversationLabel(conversation)}
            icon={<ChatAttention conversationId={conversation.id} inIndent />}
            isSelected={isSelected}
            onClick={onClick}
            endContent={status}
            actions={actions}
          />
        );
      }}
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
      {({ actions }) => (
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

// A project group's first row, or (in the flat layout) a row of the Projects
// section named after its project. The board is its board chat (`chatId`,
// once it exists), so the row spins while that chat works; the counts are
// tasks in progress (blue) and waiting for review (amber). Order at the end:
// counts, then the spinner, then the ⋯ (SideNavItem puts `actions` last).
function BoardRow({
  label = "Board",
  summary,
  chatId,
  isSelected,
  onClick,
  actions,
}: {
  label?: string;
  summary: BoardSummary | undefined;
  chatId: string | undefined;
  isSelected: boolean;
  onClick: () => void;
  actions?: ReactNode;
}) {
  const { active: generating } = useGenerating(chatId ?? "");
  const inProgress = summary?.inProgress ?? 0;
  const review = summary?.review ?? 0;
  const hasEnd = generating || !!inProgress || !!review;
  return (
    <SideNavItem
      label={label}
      icon={SquareKanban}
      isSelected={isSelected}
      onClick={onClick}
      actions={actions}
      endContent={
        hasEnd ? (
          <HStack gap={1.5} vAlign="center">
            {!!inProgress && (
              <Badge
                variant="info"
                label={inProgress}
                aria-label={`${inProgress} in progress`}
              />
            )}
            {!!review && (
              <Badge
                variant="warning"
                label={review}
                aria-label={`${review} in review`}
              />
            )}
            {/* Last, so it reads counts, spinner, then the row's ⋯. */}
            {generating && <Spinner size="sm" aria-label="Working" />}
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
//
// No `collapsible`: that always draws a chevron in the row. The whole header
// row is the fold toggle instead (a button, so Enter/Space work), and a
// folded group just renders no children. On the icon
// rail the children always render, as the folder's flyout. Done works the
// same way.
function ProjectGroup({
  project,
  isCollapsed,
  onCollapsedChange,
  onRemove,
  children,
  isRail,
}: {
  project: RecentProject;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onRemove: () => void;
  children: ReactNode;
  // The sidebar is the icon rail, where the group is a flyout.
  isRail: boolean;
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
        // `collapsible={false}`: with children, the default still adds a
        // separate chevron toggle. Astryx then clears `aria-expanded` on the
        // row, so the fold state is announced as a description instead.
        collapsible={false}
        onClick={() => onCollapsedChange(!isCollapsed)}
        aria-description={isCollapsed ? "Collapsed" : "Expanded"}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          setIsMenuOpen(true);
        }}
        {...focusProps}
        actions={
          <HStack
            as="span"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            {...focusProps}
          >
            <RevealedActions
              revealProps={getContentRevealProps()}
              isRevealed={isMenuOpen || isHovered || isFocused}
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
            </RevealedActions>
          </HStack>
        }
      >
        {(isRail || !isCollapsed) && children}
      </SideNavItem>
    </Stack>
  );
}

// Which ends of a scroll box have more scrolled out of view, kept current on
// scroll and whenever the box or its content changes size.
function useScrollEdges(
  viewportRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
  isActive: boolean,
) {
  const [edges, setEdges] = useState({ above: false, below: false });
  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!isActive || !viewport || !content) return;
    const update = () => {
      const above = viewport.scrollTop > 0;
      const below =
        viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1;
      setEdges((e) =>
        e.above === above && e.below === below ? e : { above, below },
      );
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(content);
    return () => {
      viewport.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [viewportRef, contentRef, isActive]);
  return edges;
}

// A section's list that scrolls on its own under the section's fixed title,
// with a fade at whichever edge has more out of view. Inactive (the icon
// rail), it's a plain column and the side nav scrolls as a whole.
function ScrollList({
  isActive,
  children,
}: {
  isActive: boolean;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { above, below } = useScrollEdges(viewportRef, contentRef, isActive);
  return (
    <VStack xstyle={isActive && styles.scrollFrame}>
      {isActive && (
        <VStack
          aria-hidden
          xstyle={[
            styles.scrollFade,
            styles.scrollFadeTop,
            above && styles.scrollFadeShown,
          ]}
        />
      )}
      <VStack ref={viewportRef} xstyle={isActive && styles.scrollViewport}>
        {/* The section body's own gap, which this one child takes over. */}
        <VStack ref={contentRef} gap={0.5}>
          {children}
        </VStack>
      </VStack>
      {isActive && (
        <VStack
          aria-hidden
          xstyle={[
            styles.scrollFade,
            styles.scrollFadeBottom,
            below && styles.scrollFadeShown,
          ]}
        />
      )}
    </VStack>
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
  const isFlat = usePreference("sidebarLayout") === "flat";
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
  // "Grouped at the top" puts task chats first in each project, or first in
  // the one list when the sidebar is flat.
  const taskChatsFirst = (list: ConversationSummary[]) =>
    taskChats === "top"
      ? [...list.filter(isTaskChat), ...list.filter((c) => !isTaskChat(c))]
      : list;
  const chatsFor = (root: string) =>
    taskChatsFirst(openChats.filter((c) => c.projectRoot === root));
  const flatChats = taskChatsFirst(openChats);
  const projectName = (root: string) =>
    projects.find((p) => p.path === root)?.name ?? basename(root);
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

  const filterMenu = (
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
      <DropdownMenuGroup title="Chats">
        <DropdownMenuRadioGroup
          label="Chats"
          value={isFlat ? "flat" : "project"}
          onChange={(value) =>
            setPreferences({
              sidebarLayout: value as Preferences["sidebarLayout"],
            })
          }
        >
          <DropdownMenuRadioItem value="project" label="Grouped by project" />
          <DropdownMenuRadioItem value="flat" label="Flat list" />
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
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
  );

  const conversationRow = (c: ConversationSummary) => (
    <ConversationRow
      key={c.id}
      conversation={c}
      projectName={projectName(c.projectRoot)}
      hasProjectLine={isFlat}
      isSelected={c.id === activeSessionId}
      onClick={() => openConversation(c.id)}
      onDelete={() => setPendingDelete(c)}
      onMarkDone={() => setConversationDone(c.id, true)}
    />
  );

  return (
    <SideNav
      aria-label="Conversations"
      xstyle={styles.rail}
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
        // Done is pinned here, just above Settings, so it stays put however
        // long the projects/chats above it get (#69); only `children` scroll.
        <>
          {doneConversations.length > 0 && (
            <>
              <SideNavSection title="Done" isHeaderHidden>
                <SideNavItem
                  label="Done"
                  icon={Archive}
                  collapsible={false}
                  onClick={() => setDoneOpen(!isDoneOpen)}
                  aria-description={isDoneOpen ? "Expanded" : "Collapsed"}
                  endContent={
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {doneConversations.length}
                    </Text>
                  }
                >
                  {(collapse.isCollapsed || isDoneOpen) && (
                    <VStack gap={1} xstyle={[styles.nested, styles.doneList]}>
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
                  )}
                </SideNavItem>
              </SideNavSection>
              {/* A rule between Done and Settings. */}
              <Divider />
            </>
          )}
          <SideNavSection title="App" isHeaderHidden>
            <SideNavItem
              label="Settings"
              icon={SettingsIcon}
              onClick={() => setSettingsModalOpen(true)}
            />
          </SideNavSection>
        </>
      }
    >
      <VStack xstyle={collapse.isCollapsed ? styles.navRail : styles.navFill}>
        {/* Same order as the shell-side-nav template: the menu, a rule, the
          projects (and, flat, a rule and the chats). Done is in the footer. */}
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
          endContent={filterMenu}
          xstyle={!collapse.isCollapsed && styles.fillSection}
        >
          <ScrollList isActive={!collapse.isCollapsed}>
            {projects.length === 0 && !collapse.isCollapsed && (
              <Text type="supporting" color="secondary">
                No projects yet
              </Text>
            )}
            {visibleProjects.map((p) => {
              const boardChat = boardChatFor(p.path);
              if (isFlat) {
                // Flat: each project is just its board, named after it, with the
                // project's ⋯ menu; its chats are in the Chats section below.
                return (
                  <RevealRow
                    key={p.path}
                    menuLabel="Project options"
                    hoverCard={
                      <VStack gap={1}>
                        <Text weight="medium" xstyle={styles.hoverCardText}>
                          {p.name}
                        </Text>
                        <Text
                          type="supporting"
                          color="secondary"
                          xstyle={styles.hoverCardText}
                        >
                          {p.path}
                        </Text>
                      </VStack>
                    }
                    items={[
                      {
                        label: "Remove project",
                        icon: <FolderMinus size={14} />,
                        variant: "destructive",
                        onClick: () => setPendingRemove(p),
                      },
                    ]}
                  >
                    {({ actions }) => (
                      <BoardRow
                        label={p.name}
                        summary={boardSummaries.find(
                          (b) => b.projectRoot === p.path,
                        )}
                        chatId={boardChat?.id}
                        isSelected={
                          !!boardChat && boardChat.id === activeSessionId
                        }
                        onClick={() => void openProjectBoard(p.path)}
                        actions={actions}
                      />
                    )}
                  </RevealRow>
                );
              }
              return (
                <ProjectGroup
                  key={p.path}
                  project={p}
                  isCollapsed={collapsedProjects.includes(p.path)}
                  onCollapsedChange={(collapsed) =>
                    setProjectCollapsed(p.path, collapsed)
                  }
                  onRemove={() => setPendingRemove(p)}
                  isRail={collapse.isCollapsed}
                >
                  <VStack gap={1} xstyle={styles.nested}>
                    <BoardRow
                      summary={boardSummaries.find(
                        (b) => b.projectRoot === p.path,
                      )}
                      chatId={boardChat?.id}
                      isSelected={
                        !!boardChat && boardChat.id === activeSessionId
                      }
                      onClick={() => void openProjectBoard(p.path)}
                    />
                    {chatsFor(p.path).map(conversationRow)}
                  </VStack>
                </ProjectGroup>
              );
            })}
            {!collapse.isCollapsed && idleCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                label={
                  idleExpanded ? "Show less" : `More projects (${idleCount})`
                }
                onClick={() => setIdleExpanded((v) => !v)}
                xstyle={styles.showMore}
              />
            )}
          </ScrollList>
        </SideNavSection>
        {isFlat && (
          <>
            <Divider />
            <SideNavSection
              title="Chats"
              xstyle={!collapse.isCollapsed && styles.fillSection}
            >
              <ScrollList isActive={!collapse.isCollapsed}>
                {flatChats.length === 0 && !collapse.isCollapsed && (
                  <Text type="supporting" color="secondary">
                    No chats yet
                  </Text>
                )}
                {collapse.isCollapsed ? (
                  // On the icon rail the chats are one icon with a flyout, the
                  // way a project's folder is when they're grouped.
                  <SideNavItem
                    label="Chats"
                    icon={MessagesSquare}
                    collapsible={false}
                  >
                    <VStack gap={1} xstyle={styles.nested}>
                      {flatChats.map(conversationRow)}
                    </VStack>
                  </SideNavItem>
                ) : (
                  <VStack gap={1} xstyle={styles.nested}>
                    {flatChats.map(conversationRow)}
                  </VStack>
                )}
              </ScrollList>
            </SideNavSection>
          </>
        )}
      </VStack>
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
