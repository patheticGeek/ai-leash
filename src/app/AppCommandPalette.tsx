import {
  CommandPalette,
  CommandPaletteInput,
} from "@astryxdesign/core/CommandPalette";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon, type IconName, type IconType } from "@astryxdesign/core/Icon";
import { Kbd } from "@astryxdesign/core/Kbd";
import { Text } from "@astryxdesign/core/Text";
import type {
  SearchableItem,
  SearchSource,
} from "@astryxdesign/core/Typeahead";
import * as stylex from "@stylexjs/stylex";
import {
  MessageSquareText,
  MessagesSquare,
  SettingsIcon,
  SquareKanban,
  SquarePen,
} from "lucide-react";
import { useMemo } from "react";
import { useBoardSummaries } from "../data/board";
import { conversationLabel, useConversations } from "../data/conversations";
import { useIsBoardView } from "../features/board/useIsBoardView";
import { TAB_KINDS } from "../features/tabs/tabKinds";
import { fuzzyFilter } from "../lib/fuzzyMatch";
import { SHORTCUTS, type ShortcutId } from "../lib/shortcuts";
import { type PanelTabKind, useAppStore } from "../store";

const styles = stylex.create({
  // The label takes the row and truncates; the project and key badges keep
  // their size at the end.
  label: { flex: 1, minWidth: 0 },
  end: { flexShrink: 0 },
});

interface PaletteData {
  group: "Chats" | "Boards" | "Commands";
  // A lucide icon, or a registry name for a command whose button uses one.
  icon: IconType | IconName;
  // The project, on a chat row.
  hint?: string;
  // A task chat's `#number`, for search.
  taskNumber?: number;
  // A command's shortcut, in `Kbd` format.
  keys?: string;
  run: () => void;
}

type PaletteItem = SearchableItem<PaletteData>;

// The side-panel tools Ctrl+1…4 open, in that order (the tab chooser's
// cards).
export const PANEL_TOOL_SHORTCUTS: [ShortcutId, PanelTabKind][] = [
  ["openFiles", "filetree"],
  ["openTerminal", "terminal"],
  ["openSubAgents", "subagents"],
  ["openActions", "actions"],
];

export interface PaletteCommands {
  newThread: () => void;
  toggleSidebar: () => void;
  toggleSidePanel: () => void;
  settings: () => void;
  openTool: (kind: PanelTabKind) => void;
  focusComposer: () => void;
}

const basename = (path: string) =>
  path.split(/[\\/]/).filter(Boolean).pop() ?? path;

// The groups, in the order they show.
const GROUPS: PaletteData["group"][] = ["Boards", "Chats", "Commands"];

// The Ctrl+K palette: jump to a project board or any open chat, or run a
// command. Astryx's `CommandPalette` owns the arrow keys, Enter and Escape;
// this builds its list, grouped by `auxiliaryData.group`, and filters it
// itself (`fuzzyFilter`: case- and separator-blind, every word somewhere in
// the title, project, `#task` or group, best matches first within a group).
export default function AppCommandPalette({
  commands,
  isSidebarCollapsed,
}: {
  commands: PaletteCommands;
  /** Picks the sidebar command's chevron, like its collapse button's. */
  isSidebarCollapsed: boolean;
}) {
  const isOpen = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const openConversation = useAppStore((s) => s.openConversation);
  const openProjectBoard = useAppStore((s) => s.openProjectBoard);
  const conversations = useConversations();
  const boardSummaries = useBoardSummaries();
  const boardView = useIsBoardView();
  const sidePanelOpen = useAppStore((s) => s.sidePanelOpen);

  const items = useMemo(() => {
    const projectName = (root: string) =>
      recentProjects.find((p) => p.path === root)?.name ?? basename(root);

    // Open chats, most recent first — the sidebar's list without its
    // board rows and Done group.
    const chats: PaletteItem[] = conversations
      .filter((c) => c.role !== "project" && !c.done)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({
        id: `chat:${c.id}`,
        label: conversationLabel(c),
        auxiliaryData: {
          group: "Chats",
          icon: MessagesSquare,
          hint: projectName(c.projectRoot),
          taskNumber: c.taskNumber ?? undefined,
          run: () => void openConversation(c.id),
        },
      }));

    // A board only for a project in use — an open chat, a board (tasks on
    // it) or its board chat — the sidebar's rule for what stays out from
    // behind "More projects" (`isIdle` in `LeftBar.tsx`). Most recent
    // activity (any conversation in it) first.
    const lastActivity = new Map<string, number>();
    const inUse = new Set<string>(boardSummaries.map((b) => b.projectRoot));
    for (const c of conversations) {
      lastActivity.set(
        c.projectRoot,
        Math.max(lastActivity.get(c.projectRoot) ?? 0, c.updatedAt),
      );
      if (c.role === "project" || !c.done) inUse.add(c.projectRoot);
    }
    // Known projects, then any a conversation still points at that was
    // forgotten from the list (as the sidebar does).
    const roots = [
      ...recentProjects.map((p) => p.path),
      ...[...inUse].filter(
        (root) => !recentProjects.some((p) => p.path === root),
      ),
    ];
    const boards: PaletteItem[] = roots
      .filter((root) => inUse.has(root))
      .sort((a, b) => (lastActivity.get(b) ?? 0) - (lastActivity.get(a) ?? 0))
      .map((root) => ({
        id: `board:${root}`,
        label: `${projectName(root)} Board`,
        auxiliaryData: {
          group: "Boards",
          icon: SquareKanban,
          hint: projectName(root),
          run: () => void openProjectBoard(root),
        },
      }));

    const command = (
      id: ShortcutId,
      icon: IconType | IconName,
      run: () => void,
    ): PaletteItem => ({
      id: `command:${id}`,
      label: SHORTCUTS[id].label,
      auxiliaryData: { group: "Commands", icon, keys: SHORTCUTS[id].keys, run },
    });
    const cmds: PaletteItem[] = [
      command("newThread", SquarePen, commands.newThread),
      command("focusComposer", MessageSquareText, commands.focusComposer),
      // The sidebar's collapse chevron: left while open, right once
      // collapsed (mirroring the side panel's below).
      command(
        "toggleSidebar",
        isSidebarCollapsed ? "chevronRight" : "chevronLeft",
        commands.toggleSidebar,
      ),
      // A board has no side panel to toggle or open tools in.
      ...(boardView
        ? []
        : [
            // The panel toggle's own chevron (`CentreBandEnd`): it points at
            // the edge the panel folds into while open, back out once closed.
            command(
              "toggleSidePanel",
              sidePanelOpen ? "chevronRight" : "chevronLeft",
              commands.toggleSidePanel,
            ),
            ...PANEL_TOOL_SHORTCUTS.map(([id, kind]) =>
              command(id, TAB_KINDS[kind].icon, () => commands.openTool(kind)),
            ),
          ]),
      command("settings", SettingsIcon, commands.settings),
    ];

    return [...boards, ...chats, ...cmds];
  }, [
    conversations,
    boardSummaries,
    recentProjects,
    boardView,
    sidePanelOpen,
    isSidebarCollapsed,
    commands,
    openConversation,
    openProjectBoard,
  ]);

  const searchSource = useMemo<SearchSource<PaletteItem>>(
    () => ({
      bootstrap: () => items,
      // Ranked within each group; the groups keep their order.
      search: (query) =>
        GROUPS.flatMap((group) =>
          fuzzyFilter(
            query,
            items.filter((i) => i.auxiliaryData?.group === group),
            (i) => {
              const data = i.auxiliaryData;
              return [
                i.label,
                data?.hint ?? "",
                data?.taskNumber != null ? `#${data.taskNumber}` : "",
                group,
              ];
            },
          ),
        ),
    }),
    [items],
  );

  return (
    <CommandPalette
      isOpen={isOpen}
      onOpenChange={setOpen}
      label="Command palette"
      width="36rem"
      searchSource={searchSource}
      // The palette closes itself after a choice; this runs it.
      onValueChange={(id) => {
        items.find((i) => i.id === id)?.auxiliaryData?.run();
      }}
      input={
        <CommandPaletteInput placeholder="Jump to a chat, board or command…" />
      }
      emptySearchText="No matches."
      renderItem={(item) => {
        const data = item.auxiliaryData;
        return (
          <HStack gap={2} align="center" width="100%">
            {data && <Icon icon={data.icon} size="sm" color="secondary" />}
            <Text maxLines={1} xstyle={styles.label}>
              {item.label}
            </Text>
            {data?.hint && (
              <Text
                type="supporting"
                size="xsm"
                color="secondary"
                maxLines={1}
                xstyle={styles.end}
              >
                {data.hint}
              </Text>
            )}
            {data?.keys && <Kbd keys={data.keys} xstyle={styles.end} />}
          </HStack>
        );
      }}
    />
  );
}
