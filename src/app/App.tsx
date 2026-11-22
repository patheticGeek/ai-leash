import { AppShell } from "@astryxdesign/core/AppShell";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { ResizeHandle } from "@astryxdesign/core/Resizable";
import { borderVars, colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useEffect } from "react";
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
import { useFsChangeInvalidator } from "../features/sidebar/tabs/useFsDir";
import { TabContentHost } from "../features/tabs/TabContent";
import { TabDndProvider } from "../features/tabs/TabDnd";
import { useResizableWidth } from "../hooks/useResizableWidth";
import {
  useAcpAgentCatalog,
  useAcpCatalogInvalidator,
} from "../lib/acpCatalogQuery";
import { BUILD_LABEL } from "../lib/buildChannel";
import { useGeneratingListener } from "../lib/generatingQuery";
import { LS_KEYS } from "../lib/localStorageKeys";
import { useGitBranchWatchers } from "../lib/useCurrentGitBranch";
import { useAppStore } from "../store";
import CenterPanel from "./CenterPanel";
import LeftBar from "./LeftBar";
import TitleBar from "./TitleBar";

const styles = stylex.create({
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

  const leftBar = useResizableWidth(LS_KEYS.leftBarWidth, 220, 160, 400);
  const rightPanel = useResizableWidth(LS_KEYS.rightPanelWidth, 360, 240, 720);

  useEffect(() => {
    initializeStartupSession();
  }, [initializeStartupSession]);

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
      <AppShell
        variant="wash"
        // A desktop window, not a responsive page: the sidebar stays inline
        // however narrow the window gets, never a mobile drawer.
        mobileNav={{ breakpoint: "none", hasToggle: false }}
        xstyle={BUILD_LABEL ? styles.buildFrame : undefined}
        topNav={
          <TitleBar
            leftBarWidth={leftBar.size}
            rightPanelWidth={boardView ? null : rightPanel.size}
          />
        }
        sideNav={<LeftBar resizable={leftBar} />}
      >
        <TabDndProvider>
          <Layout
            content={
              <LayoutContent isScrollable={false}>
                {/* Per switch, not per id: a new thread getting its id on its
                    first message must not remount the panel — see
                    `viewEpoch`. */}
                <CenterPanel key={viewEpoch} />
              </LayoutContent>
            }
            end={
              !boardView && (
                <>
                  <ResizeHandle
                    isReversed
                    resizable={rightPanel}
                    label="Resize side panel"
                  />
                  <LayoutPanel
                    resizable={rightPanel}
                    isScrollable={false}
                    label="Side panel"
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
      <DebugDevtoolsOverlay />
      <TabContentHost />
    </>
  );
}

export default App;
