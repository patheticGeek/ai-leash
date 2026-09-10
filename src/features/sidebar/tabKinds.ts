import { Bot, FolderTree, SquareTerminal, Zap } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { createElement } from "react";
import type { PanelTab, PanelTabKind } from "../../store";
import ActionsTab from "./tabs/ActionsTab";
import ActionTerminalTab from "./tabs/ActionTerminalTab";
import FileEditorTab from "./tabs/FileEditorTab";
import FileTree from "./tabs/FileTree";
import SubAgentsTab from "./tabs/SubAgentsTab";
import TerminalPanel from "./tabs/TerminalPanel";

// How SidePanel.tsx should mount a tab kind's content:
//  - "keep-mounted-per-tab": rendered for every open tab of this kind,
//    kept in the DOM (hidden via CSS) even while inactive. Required for
//    kinds whose component holds live state that an unmount would kill
//    (terminal/action: xterm + PTY stream; filetree: no live state today,
//    but kept mounted for the same "don't rebuild on every tab switch"
//    treatment it's always had). terminal/action can have multiple
//    simultaneous tab instances; filetree only ever has one, but is
//    looked up the same way (`panelTabs.filter(...)` naturally yields at
//    most one filetree tab, since `panelTabIdFor` gives it a fixed id).
//  - "active-only": rendered only while its tab is the single active tab,
//    unmounted otherwise. For kinds whose component reads its content
//    from the store by current state (active file path, sub-agent list,
//    action list) rather than holding irreplaceable local state, so
//    remounting on tab-switch is harmless.
export type PanelMountMode = "keep-mounted-per-tab" | "active-only";

export interface PanelTabKindDef {
  kind: PanelTabKind;
  /** Tab content for one open tab of this kind. */
  render: (tab: PanelTab) => ReactNode;
  mountMode: PanelMountMode;
  /** Whether this kind should appear as a tile in TabPicker's "+" menu.
   * false for kinds only ever opened programmatically (clicking a file,
   * running an Action). */
  openableFromPicker: boolean;
  /** Picker tile copy — only meaningful when openableFromPicker is true. */
  label?: string;
  hint?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
}

export const PANEL_TAB_KINDS: Record<PanelTabKind, PanelTabKindDef> = {
  filetree: {
    kind: "filetree",
    render: () => createElement(FileTree),
    mountMode: "keep-mounted-per-tab",
    openableFromPicker: true,
    label: "File Tree",
    hint: "Browse project files",
    icon: FolderTree,
  },
  terminal: {
    kind: "terminal",
    render: () => createElement(TerminalPanel),
    mountMode: "keep-mounted-per-tab",
    openableFromPicker: true,
    label: "Terminal",
    hint: "Start a shell in this project",
    icon: SquareTerminal,
  },
  subagents: {
    kind: "subagents",
    render: () => createElement(SubAgentsTab),
    mountMode: "active-only",
    openableFromPicker: true,
    label: "Sub Agents",
    hint: "Watch running sub-agent tasks",
    icon: Bot,
  },
  actions: {
    kind: "actions",
    render: () => createElement(ActionsTab),
    mountMode: "active-only",
    openableFromPicker: true,
    label: "Actions",
    hint: "Run and manage project actions",
    icon: Zap,
  },
  file: {
    kind: "file",
    render: () => createElement(FileEditorTab),
    mountMode: "active-only",
    openableFromPicker: false,
  },
  action: {
    kind: "action",
    render: (tab) =>
      tab.path
        ? createElement(ActionTerminalTab, { actionId: tab.path })
        : null,
    mountMode: "keep-mounted-per-tab",
    openableFromPicker: false,
  },
};

/** Kinds shown as tiles in TabPicker, in registry-declaration order. */
export const PICKER_TAB_KINDS: PanelTabKindDef[] = Object.values(
  PANEL_TAB_KINDS,
).filter((def) => def.openableFromPicker);
