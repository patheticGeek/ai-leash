import { AppShell } from "@astryxdesign/core/AppShell";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { ResizeHandle } from "@astryxdesign/core/Resizable";
import { borderVars, colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo } from "react";
import { useAcpSessionOptionsListener } from "../data/acpSessionOptions";
import { useBackendModels, useBackendsListener } from "../data/backends";
import { useBoardListener } from "../data/board";
import { useConversationsListener } from "../data/conversations";
import { useSubAgentsListener } from "../data/subAgents";
import { useActionEvents } from "../features/actions/useActions";
import { useIsBoardView } from "../features/board/useIsBoardView";
import DebugDevtoolsOverlay from "../features/debug/DebugDevtoolsOverlay";
import SettingsModal from "../features/settings/SettingsModal";
import SidePanel from "../features/sidebar/SidePanel";
import { useAgentOpenFile } from "../features/sidebar/tabs/useAgentOpenFile";
import { useFsChangeInvalidator } from "../features/sidebar/tabs/useFsDir";
import { TabContentHost } from "../features/tabs/TabContent";
import { TabDndProvider } from "../features/tabs/TabDnd";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { useShortcuts } from "../hooks/useShortcuts";
import {
  useAcpAgentCatalog,
  useAcpCatalogInvalidator,
} from "../lib/acpCatalogQuery";
import { BUILD_LABEL } from "../lib/buildChannel";
import { useGeneratingListener } from "../lib/generatingQuery";
import { LS_KEYS } from "../lib/localStorageKeys";
import { useGitBranchWatchers } from "../lib/useCurrentGitBranch";
import { useAppStore } from "../store";
import { PRIMARY_TAB_ID } from "../store/panelSlice";
import AppCommandPalette, {
  PANEL_TOOL_SHORTCUTS,
  type PaletteCommands,
} from "./AppCommandPalette";
import CenterPanel from "./CenterPanel";
import LeftBar from "./LeftBar";
import { startNewThread } from "./projectActions";
import { useSidebarCollapse } from "./sidebarCollapse";

const styles = stylex.create({
  // The side panel on the sidebar's colour, a step up from the centre's,
  // so the chat is the darkest (most focused) surface between two rails.
  sidePanel: { backgroundColor: colorVars["--color-background-body"] },
  // Dev/preview builds get a thin warning-coloured frame round the whole
  // window, so they can't be mistaken for the release app.
  buildFrame: {
    "::after": {
      content: '""',
      position: "fixed",
      inset: 0,
      zIndex: 999,
      pointerEvents: "none",
      borderWidth: borderVars["--border-width"],
      borderStyle: "solid",
      borderColor: colorVars["--color-border-warning"],
    },
  },
});

function App() {
  const viewEpoch = useAppStore((s) => s.viewEpoch);
  // The board and its project chat take the whole width: no side panel.
  const boardView = useIsBoardView();
  const initializeStartupSession = useAppStore(
    (s) => s.initializeStartupSession,
  );

  // Always on regardless of which sidebar tab is open — see its comment for
  // why this can't just live inside `FileTree`.
  useFsChangeInvalidator();
  // Always on — the agent's `open_file` tool, for whichever conversation
  // made the call (see its comment).
  useAgentOpenFile();
  // Always on regardless of which conversation is open — see its comment
  // for why a single top-level listener replaces what used to be a
  // per-session one.
  useGeneratingListener();
  // Always on — keeps the conversation list query live off the backend's
  // `conversation://changed` event (see its comment).
  useConversationsListener();
  // Always on — keeps every open board and the sidebar's board counts live
  // off `board://changed`.
  useBoardListener();
  // Always on — keeps every open sub-agent list live off `agent://lifecycle`.
  useSubAgentsListener();
  // Always on — keeps each conversation's ACP connection options live off
  // `acp://session-options`.
  useAcpSessionOptionsListener();
  // Always on — keeps the backend registry live off `backends://changed`.
  useBackendsListener();
  // Always on — keeps every checkout's Actions list live off `run://status`
  // and `action://defs-changed` (see `useActions.ts`); nothing polls it.
  useActionEvents();
  // Always on — watches every known project's git `HEAD`, not just the
  // ones with a branch label mounted (see its comment).
  useGitBranchWatchers();
  // Always on — invalidates `useAcpAgentCatalog()` whenever Rust's
  // background refresh (or an on-demand discovery) updates the catalog.
  useAcpCatalogInvalidator();
  // Keeps the catalog query warm here too, not just inside `ChatPanel`'s
  // `useChatSession` (its only other caller) — that one is keyed on
  // `viewEpoch` (see `TabContentHost`), so it fully unmounts and
  // remounts on every conversation switch. Without a subscriber that
  // survives the switch, the query would otherwise drop to zero observers
  // between the old conversation's unmount and the new one's mount and the
  // picker would flash empty for a tick each time, even though the
  // underlying data itself hasn't changed.
  useAcpAgentCatalog();
  // Same reasoning, for each backend's model list — keeps them warm across
  // conversation switches.
  useBackendModels();

  // Collapsible: the sidebar folds to its icon rail (see `sidebarCollapse`).
  const leftBar = useResizableWidth(LS_KEYS.leftBarWidth, 260, 180, 420, true);
  const sidebarCollapse = useSidebarCollapse(leftBar);
  const rightPanel = useResizableWidth(LS_KEYS.rightPanelWidth, 360, 240, 720);

  useEffect(() => {
    initializeStartupSession();
  }, [initializeStartupSession]);

  const sidePanelOpen = useAppStore((s) => s.sidePanelOpen);
  const setSidePanelOpen = useAppStore((s) => s.setSidePanelOpen);
  const openPanelTab = useAppStore((s) => s.openPanelTab);
  const setSettingsModalOpen = useAppStore((s) => s.setSettingsModalOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const requestComposerFocus = useAppStore((s) => s.requestComposerFocus);

  // What the palette's commands and the shortcuts below both run.
  const commands = useMemo<PaletteCommands>(
    () => ({
      newThread: () => void startNewThread(),
      toggleSidebar: () =>
        sidebarCollapse.onCollapsedChange(!sidebarCollapse.isCollapsed),
      toggleSidePanel: () =>
        setSidePanelOpen(!useAppStore.getState().sidePanelOpen),
      settings: () => setSettingsModalOpen(true),
      openTool: (kind) => openPanelTab(kind),
      // Only with the main chat (or a board, which always shows its own
      // view — `CenterPanel`) in front: a sub-agent transcript or a file in
      // the centre has no message box.
      focusComposer: () => {
        if (
          boardView ||
          useAppStore.getState().activeChatTabId === PRIMARY_TAB_ID
        ) {
          requestComposerFocus();
        }
      },
    }),
    [
      sidebarCollapse,
      setSidePanelOpen,
      setSettingsModalOpen,
      openPanelTab,
      requestComposerFocus,
      boardView,
    ],
  );

  // Every global shortcut (see `lib/shortcuts.ts`). The side-panel ones do
  // nothing on a board, which has no side panel.
  useShortcuts({
    palette: () =>
      setCommandPaletteOpen(!useAppStore.getState().commandPaletteOpen),
    newThread: commands.newThread,
    toggleSidebar: commands.toggleSidebar,
    settings: commands.settings,
    focusComposer: commands.focusComposer,
    ...(!boardView && {
      toggleSidePanel: commands.toggleSidePanel,
      ...Object.fromEntries(
        PANEL_TOOL_SHORTCUTS.map(([id, kind]) => [
          id,
          () => commands.openTool(kind),
        ]),
      ),
    }),
  });

  // webkit2gtk (the Linux webview) only wires Ctrl+Z/Y into its editing
  // engine via a native app menu's Undo/Redo accelerators — this app has no
  // native menu (custom chromeless titlebar), so plain inputs/textareas get
  // no undo at all there. `execCommand` reaches the same internal undo
  // manager directly, sidestepping the missing accelerator wiring; harmless
  // on platforms where the native shortcut already works.
  useEffect(() => {
    function handleUndoRedo(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        document.execCommand(e.shiftKey ? "redo" : "undo");
      } else if (key === "y") {
        e.preventDefault();
        document.execCommand("redo");
      }
    }
    document.addEventListener("keydown", handleUndoRedo);
    return () => document.removeEventListener("keydown", handleUndoRedo);
  }, []);

  return (
    <>
      {/* The default `elevated` variant: the sidebar sits on the body
          colour and the main region on the surface colour. The theme makes
          surface the darkest (#0f0f10) and body a step up (#161617), so the
          chat is darker than the rails either side of it. */}
      <AppShell
        contentPadding={0}
        // A desktop window, not a responsive page: the sidebar stays inline
        // however narrow the window gets, never a mobile drawer.
        mobileNav={{ breakpoint: "none", hasToggle: false }}
        xstyle={BUILD_LABEL ? styles.buildFrame : undefined}
        sideNav={<LeftBar resizable={leftBar} collapse={sidebarCollapse} />}
      >
        {/* The shell-side-nav template's frame, without its pinned header:
            the sidebar runs the full window height, and so do the centre and
            the side panel (the ide template's split: the centre fills, the
            side panel sits in the end slot behind a ResizeHandle that owns
            the divider). Each pane opens with its own top band — its tabs,
            then its controls — and the two bands line up as one bar; the
            window controls end the rightmost (see `TopBand`). */}
        <TabDndProvider>
          <Layout
            height="fill"
            content={
              <LayoutContent padding={0} isScrollable={false}>
                {/* Per switch, not per id: a new thread getting its id on its
                    first message must not remount the panel — see
                    `viewEpoch`. */}
                <CenterPanel
                  key={viewEpoch}
                  sidebarCollapse={sidebarCollapse}
                />
              </LayoutContent>
            }
            // Closed (Ctrl+J or the centre band's toggle), the chat takes
            // the full width.
            end={
              !boardView &&
              sidePanelOpen && (
                <>
                  <ResizeHandle
                    direction="horizontal"
                    hasDivider
                    isReversed
                    isAlwaysVisible={false}
                    resizable={rightPanel}
                    label="Resize side panel"
                  />
                  <LayoutPanel
                    resizable={rightPanel}
                    hasDivider={false}
                    padding={0}
                    isScrollable={false}
                    label="Side panel"
                    xstyle={styles.sidePanel}
                  >
                    <SidePanel />
                  </LayoutPanel>
                </>
              )
            }
          />
        </TabDndProvider>
      </AppShell>
      <SettingsModal />
      <AppCommandPalette
        commands={commands}
        isSidebarCollapsed={sidebarCollapse.isCollapsed}
      />
      <DebugDevtoolsOverlay />
      <TabContentHost />
    </>
  );
}

export default App;
