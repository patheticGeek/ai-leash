import { BreadcrumbItem, Breadcrumbs } from "@astryxdesign/core/Breadcrumbs";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SideNavCollapseButton } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bug, Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useConversations } from "@/data/conversations";
import { usePreference } from "@/data/preferences";
import BoardLayoutSwitch from "../features/board/BoardLayoutSwitch";
import { latestAcpSessionId } from "../features/debug/acpSessionId";
import { BUILD_LABEL } from "../lib/buildChannel";
import { useAppStore } from "../store";
import OpenInIdeButton from "./OpenInIdeButton";
import type { SidebarCollapse } from "./sidebarCollapse";
import TitleBarActions from "./TitleBarActions";

// The Toolbar's `md` height: where the floating debug panel stops when
// dragged up, so it never covers the window controls.
export const TITLEBAR_HEIGHT = 44;

const styles = stylex.create({
  // The divider between control groups, copied from the kanban-board
  // template's toolbar.
  toolbarDivider: {
    height: "auto",
    marginBlock: spacingVars["--spacing-1"],
    alignSelf: "stretch",
  },
  // The breadcrumb takes what the controls leave and truncates.
  start: { minWidth: 0 },
});

// `getCurrentWindow()` reads `window.__TAURI_INTERNALS__` synchronously and
// throws when this file runs outside an actual Tauri webview — e.g. opening
// the Vite dev server directly in a plain browser tab, which is a normal
// part of this project's dev workflow. Resolved lazily and gated on that
// global so doing so degrades to inert buttons instead of crashing the
// single app-wide ErrorBoundary.
function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function tauriWindow() {
  return isTauri() ? getCurrentWindow() : null;
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = tauriWindow();
    if (!win) return;
    win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setMaximized);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <>
      <Divider
        variant="strong"
        orientation="vertical"
        xstyle={styles.toolbarDivider}
      />
      <IconButton
        variant="ghost"
        size="sm"
        label="Minimize"
        icon={<Icon icon={Minus} size="sm" />}
        onClick={() => tauriWindow()?.minimize()}
      />
      <IconButton
        variant="ghost"
        size="sm"
        label={maximized ? "Restore" : "Maximize"}
        icon={<Icon icon={maximized ? Copy : Square} size="sm" />}
        onClick={() => tauriWindow()?.toggleMaximize()}
      />
      <IconButton
        variant="ghost"
        size="sm"
        label="Close window"
        icon={<Icon icon={X} size="sm" />}
        onClick={() => tauriWindow()?.close()}
      />
    </>
  );
}

// The project id / conversation id / ACP session id line debug mode shows in
// place of the breadcrumb.
function DebugIds() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const projectId = useAppStore((s) => s.projectId);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const debugEvents = useAppStore((s) => s.debugEvents);
  // Only meaningful once debug mode has captured at least one
  // `session/new`/`session/load` event for this conversation — see
  // `latestAcpSessionId`'s doc comment for why this can't just be read off
  // app state directly.
  const acpSessionId = latestAcpSessionId(debugEvents, activeSessionId);
  return (
    // The project root is the tooltip rather than the line itself:
    // `projectId` is the project's real identity (it survives the folder
    // being moved or renamed), but the path is what makes it recognizable
    // at a glance.
    <Tooltip
      hasHoverIndication={false}
      content={
        <VStack>
          <Text>project id / conversation id / session id</Text>
          <Text>{projectRoot ?? "no project"}</Text>
        </VStack>
      }
    >
      <Text type="code" size="2xs" color="disabled" maxLines={1}>
        {projectId ?? "—"} / {activeSessionId ?? "—"} / {acpSessionId ?? "—"}
      </Text>
    </Tooltip>
  );
}

// The window's title bar: the main region's pinned header (a Toolbar, since
// it carries controls), not a TopNav — the sidebar runs the full window
// height as in the shell-side-nav template, and this bar spans only the
// centre and the side panel. Start: a one-line breadcrumb, `project / chat
// title`, `project / Board` or `project / New thread`, led by the sidebar's
// expand toggle while it's collapsed. End: Open in external editor and the
// Actions split button (on a board, its layout switch instead), then the
// window controls.
export default function TitleBar({
  sidebarCollapse,
}: {
  sidebarCollapse: SidebarCollapse;
}) {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const conversations = useConversations();
  const chatTabs = useAppStore((s) => s.chatTabs);
  const activeChatTabId = useAppStore((s) => s.activeChatTabId);
  const openProjectBoard = useAppStore((s) => s.openProjectBoard);
  const debugShowIds = usePreference("debugShowIds");
  const debugModeEnabled = usePreference("debugModeEnabled");
  const debugPanelOpen = useAppStore((s) => s.debugPanelOpen);
  const setDebugPanelOpen = useAppStore((s) => s.setDebugPanelOpen);

  const project = recentProjects.find((p) => p.path === projectRoot);
  const activeConversation = conversations.find(
    (c) => c.id === activeSessionId,
  );
  const boardView = activeConversation?.role === "project";
  // A new thread (no id until its first message) — see `ChatPanel.tsx`'s
  // `isNewThread`.
  const isNewThread = useAppStore((s) => s.draft !== null);
  const activeChatTab = chatTabs.find((t) => t.id === activeChatTabId);
  const pageTitle = isNewThread
    ? "New thread"
    : boardView
      ? "Board"
      : activeChatTab?.kind === "subagent"
        ? activeChatTab.label
        : activeConversation?.title;

  const debugLabel = debugPanelOpen ? "Close ACP Events" : "Open ACP Events";

  return (
    <Toolbar
      label="Title bar"
      dividers={["bottom"]}
      // `deep`: a press anywhere in the bar drags the window, except on its
      // buttons and other controls (Tauri's drag script skips those).
      data-tauri-drag-region="deep"
      startContent={
        <HStack align="center" gap={2} xstyle={styles.start}>
          {sidebarCollapse.isCollapsed && (
            <SideNavCollapseButton
              collapsible={sidebarCollapse}
              size="sm"
              label="Expand sidebar"
            />
          )}
          {debugShowIds ? (
            <DebugIds />
          ) : (
            project && (
              <Breadcrumbs label="Location">
                {/* The project crumb opens the project's board. */}
                <BreadcrumbItem
                  isCurrent={!pageTitle}
                  onClick={() => void openProjectBoard(project.path)}
                >
                  {project.name}
                </BreadcrumbItem>
                {pageTitle && (
                  <BreadcrumbItem isCurrent>{pageTitle}</BreadcrumbItem>
                )}
              </Breadcrumbs>
            )
          )}
          {BUILD_LABEL && (
            <Token size="sm" color="orange" label={BUILD_LABEL} />
          )}
        </HStack>
      }
      endContent={
        <>
          {/* A project's board has no checkout of its own to open or run
              Actions in — just its layout switch. */}
          {boardView ? (
            <BoardLayoutSwitch />
          ) : (
            <>
              <OpenInIdeButton />
              <TitleBarActions />
            </>
          )}
          {debugModeEnabled && (
            <IconButton
              variant="ghost"
              size="sm"
              label={debugLabel}
              tooltip={debugLabel}
              icon={<Icon icon={Bug} size="sm" color="warning" />}
              onClick={() => setDebugPanelOpen(!debugPanelOpen)}
            />
          )}
          <WindowControls />
        </>
      }
    />
  );
}
