import { BreadcrumbItem, Breadcrumbs } from "@astryxdesign/core/Breadcrumbs";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SideNavCollapseButton } from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bug, Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePreference } from "@/data/preferences";
import { BoardBandSlot } from "../features/board/BoardBand";
import BoardLayoutSwitch from "../features/board/BoardLayoutSwitch";
import { useIsBoardView } from "../features/board/useIsBoardView";
import { latestAcpSessionId } from "../features/debug/acpSessionId";
import { withShortcut } from "../lib/shortcuts";
import { useAppStore } from "../store";
import OpenInIdeButton from "./OpenInIdeButton";
import type { SidebarCollapse } from "./sidebarCollapse";
import TopBarActions from "./TopBarActions";

// The top bar's height (`TopBand`'s row, `--spacing-11`): where the floating
// debug panel stops when dragged up, so it never covers the window controls.
export const TOP_BAR_HEIGHT = 44;

const styles = stylex.create({
  // The divider between control groups, copied from the kanban-board
  // template's toolbar.
  toolbarDivider: {
    height: "auto",
    marginBlock: spacingVars["--spacing-1"],
    alignSelf: "stretch",
  },
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

// Minimize / maximize / close: the app has no native title bar. They end
// whichever band is rightmost: the side panel's, or the centre's when the
// side panel isn't showing.
export function WindowControls() {
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

// The project id / conversation id / ACP session id line debug mode shows at
// the start of the centre band's end controls.
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

// Is the side panel on screen? Closed by its toggle, or a board (which has
// none). Decides which band ends in the window controls.
function useSidePanelShown() {
  const sidePanelOpen = useAppStore((s) => s.sidePanelOpen);
  const boardView = useIsBoardView();
  return sidePanelOpen && !boardView;
}

// Where you are, for the board's band, which has no tabs to say it:
// `project / Board`.
export function LocationCrumbs() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const openProjectBoard = useAppStore((s) => s.openProjectBoard);
  const project = recentProjects.find((p) => p.path === projectRoot);
  if (!project) return null;
  return (
    <Breadcrumbs label="Location">
      {/* The project crumb opens the project's board. */}
      <BreadcrumbItem onClick={() => void openProjectBoard(project.path)}>
        {project.name}
      </BreadcrumbItem>
      <BreadcrumbItem isCurrent>Board</BreadcrumbItem>
    </Breadcrumbs>
  );
}

// The start of the centre's band, before its tabs: the sidebar's expand
// toggle while it's collapsed.
export function CentreBandStart({
  sidebarCollapse,
}: {
  sidebarCollapse: SidebarCollapse;
}) {
  if (!sidebarCollapse.isCollapsed) return null;
  return (
    <Tooltip
      content={withShortcut("Expand sidebar", "toggleSidebar")}
      hasHoverIndication={false}
    >
      <SideNavCollapseButton
        collapsible={sidebarCollapse}
        size="sm"
        label="Expand sidebar"
      />
    </Tooltip>
  );
}

// The end of the centre's band: debug mode's id line, the Actions split
// button and Open in external editor (on a board, its layout switch
// instead), the ACP Events toggle, the side-panel toggle (not on a board,
// which has no side panel) and — when the side panel isn't showing, so its
// band isn't there to hold them — the window controls. The
// command palette opens from the sidebar's Search row (or Ctrl+K), not here.
export function CentreBandEnd() {
  const debugShowIds = usePreference("debugShowIds");
  const debugModeEnabled = usePreference("debugModeEnabled");
  const debugPanelOpen = useAppStore((s) => s.debugPanelOpen);
  const setDebugPanelOpen = useAppStore((s) => s.setDebugPanelOpen);
  const sidePanelOpen = useAppStore((s) => s.sidePanelOpen);
  const setSidePanelOpen = useAppStore((s) => s.setSidePanelOpen);
  const boardView = useIsBoardView();
  const sidePanelShown = useSidePanelShown();

  const debugLabel = debugPanelOpen ? "Close ACP Events" : "Open ACP Events";
  const sidePanelLabel = withShortcut(
    sidePanelOpen ? "Close side panel" : "Open side panel",
    "toggleSidePanel",
  );

  return (
    <>
      {debugShowIds && <DebugIds />}
      {/* A project's board has no checkout of its own to open or run
          Actions in: the board's own tools and New task (portalled in by
          BoardView, see `BoardBand`), then its layout switch. */}
      {boardView ? (
        <>
          <BoardBandSlot slot="end" />
          <BoardLayoutSwitch />
        </>
      ) : (
        <>
          <TopBarActions />
          <OpenInIdeButton />
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
      {!boardView && (
        <IconButton
          variant="ghost"
          size="sm"
          label={sidePanelLabel}
          tooltip={sidePanelLabel}
          // The sidebar's collapse chevron (SideNavCollapseButton's
          // registry `chevronLeft`), mirrored for the other edge: it points
          // at the edge the panel folds into while open, and back out once
          // it's closed.
          icon={
            <Icon
              icon={sidePanelOpen ? "chevronRight" : "chevronLeft"}
              size="sm"
            />
          }
          onClick={() => setSidePanelOpen(!sidePanelOpen)}
        />
      )}
      {!sidePanelShown && <WindowControls />}
    </>
  );
}
