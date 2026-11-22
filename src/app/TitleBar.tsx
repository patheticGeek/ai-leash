import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { TopNav } from "@astryxdesign/core/TopNav";
import { colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { Bug, Copy, Minus, Square, SquarePen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useConversations } from "@/data/conversations";
import { usePreference } from "@/data/preferences";
import BoardLayoutSwitch from "../features/board/BoardLayoutSwitch";
import { latestAcpSessionId } from "../features/debug/acpSessionId";
import { BUILD_LABEL } from "../lib/buildChannel";
import { useAppStore } from "../store";
import Logo from "../ui/Logo";
import OpenInIdeButton from "./OpenInIdeButton";
import TitleBarActions from "./TitleBarActions";

export const TITLEBAR_HEIGHT = 36;

const styles = stylex.create({
  nav: { padding: 0, flexWrap: "nowrap", height: TITLEBAR_HEIGHT },
  // The full window width: a definite size, since the heading slot it sits
  // in otherwise shrinks to its content.
  bar: { width: "100vw", height: TITLEBAR_HEIGHT },
  fullHeight: { height: "100%" },
  // The corners above the sidebar and the side panel, sized to match them.
  fixedRegion: { flexShrink: 0 },
  // Above the centre pane, so it takes the centre's colour.
  middle: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    backgroundColor: colorVars["--color-background-body"],
  },
  actions: { flexShrink: 0, marginInlineStart: "auto" },
  // Window-chrome buttons fill the bar's height edge to edge, square-cornered.
  windowButton: {
    height: "100%",
    width: spacingVars["--spacing-10"],
    borderRadius: 0,
  },
  closeButton: {
    backgroundColor: { default: null, ":hover": colorVars["--color-error"] },
    color: { default: null, ":hover": colorVars["--color-on-error"] },
  },
  debugButton: {
    color: colorVars["--color-text-warning"],
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
    <HStack align="center" xstyle={styles.fullHeight}>
      <IconButton
        variant="ghost"
        size="sm"
        label="Minimize"
        tooltip="Minimize"
        icon={<Minus size={14} />}
        xstyle={styles.windowButton}
        onClick={() => tauriWindow()?.minimize()}
      />
      <IconButton
        variant="ghost"
        size="sm"
        label={maximized ? "Restore" : "Maximize"}
        tooltip={maximized ? "Restore" : "Maximize"}
        icon={maximized ? <Copy size={12} /> : <Square size={12} />}
        xstyle={styles.windowButton}
        onClick={() => tauriWindow()?.toggleMaximize()}
      />
      <IconButton
        variant="ghost"
        size="sm"
        label="Close"
        tooltip="Close"
        icon={<X size={14} />}
        xstyle={[styles.windowButton, styles.closeButton]}
        onClick={() => tauriWindow()?.close()}
      />
    </HStack>
  );
}

export default function TitleBar({
  leftBarWidth,
  rightPanelWidth,
}: {
  leftBarWidth: number;
  // Null while there's no side panel (the board): its corner then just
  // fits the window controls.
  rightPanelWidth: number | null;
}) {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const projectId = useAppStore((s) => s.projectId);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const conversations = useConversations();
  const chatTabs = useAppStore((s) => s.chatTabs);
  const activeChatTabId = useAppStore((s) => s.activeChatTabId);
  const startNewConversation = useAppStore((s) => s.startNewConversation);
  const addProject = useAppStore((s) => s.addProject);
  const debugShowIds = usePreference("debugShowIds");
  const debugModeEnabled = usePreference("debugModeEnabled");
  const debugEvents = useAppStore((s) => s.debugEvents);
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
  const conversationTitle =
    activeChatTab?.kind === "subagent"
      ? activeChatTab.label
      : activeConversation?.role === "project"
        ? "Board"
        : activeConversation?.title;
  // Only meaningful once debug mode has captured at least one
  // `session/new`/`session/load` event for this conversation — see
  // `latestAcpSessionId`'s doc comment for why this can't just be read off
  // app state directly.
  const acpSessionId = debugShowIds
    ? latestAcpSessionId(debugEvents, activeSessionId)
    : undefined;

  // Starts a fresh thread directly in whatever project is currently open —
  // no project picker here (see `NewThreadHero.tsx`'s "What are we working on
  // in {project}?" heading for changing *which* project a still-fresh new
  // thread targets instead). Falls back to the native folder picker only
  // when no project has ever been opened yet, since there's nothing to
  // start a thread in otherwise.
  async function onNewThread() {
    if (projectRoot) {
      startNewConversation(projectRoot);
      return;
    }
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      await addProject(dir);
    }
  }

  return (
    <TopNav
      label="Title bar"
      // `deep`: a press anywhere in the bar drags the window, except on its
      // buttons and other controls (Tauri's drag script skips those).
      data-tauri-drag-region="deep"
      xstyle={styles.nav}
      heading={
        // The whole bar sits in the heading slot so its three regions can
        // line up with the panes below: TopNav's own start/end slots size to
        // their content and wrap, which would neither track the pane widths
        // nor let the title truncate.
        <HStack align="center" xstyle={styles.bar}>
          <HStack
            align="center"
            hAlign="between"
            width={leftBarWidth}
            paddingInlineStart={3}
            paddingInlineEnd={1.5}
            xstyle={styles.fixedRegion}
          >
            <HStack align="center" gap={1.5}>
              <Logo size="sm" />
              {BUILD_LABEL && (
                <Token size="sm" color="orange" label={BUILD_LABEL} />
              )}
            </HStack>
            <IconButton
              variant="ghost"
              size="lg"
              label="New thread"
              tooltip="Start a new thread in the current project"
              icon={<SquarePen size={17} />}
              onClick={onNewThread}
            />
          </HStack>
          <HStack align="center" paddingInline={3} xstyle={styles.middle}>
            {project && !debugShowIds && (
              <Text size="sm" color="secondary" maxLines={1}>
                {project.name}
                {isNewThread ? (
                  <Text color="disabled"> / New Thread</Text>
                ) : (
                  conversationTitle && (
                    <Text color="disabled"> / {conversationTitle}</Text>
                  )
                )}
              </Text>
            )}
            {debugShowIds && (
              // The project root is the tooltip rather than the line itself:
              // `projectId` is the project's real identity (it survives the
              // folder being moved or renamed), but the path is what makes
              // it recognizable at a glance.
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
                  {projectId ?? "—"} / {activeSessionId ?? "—"} /{" "}
                  {acpSessionId ?? "—"}
                </Text>
              </Tooltip>
            )}
            <HStack
              align="center"
              gap={1.5}
              paddingInlineStart={3}
              xstyle={styles.actions}
            >
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
            </HStack>
          </HStack>
          <HStack
            align="center"
            hAlign="end"
            // Null while there's no side panel (the board): the corner then
            // just fits the window controls.
            width={rightPanelWidth ?? undefined}
            xstyle={[styles.fixedRegion, styles.fullHeight]}
          >
            {debugModeEnabled && (
              <IconButton
                variant="ghost"
                size="sm"
                label={debugPanelOpen ? "Close ACP Events" : "Open ACP Events"}
                tooltip={
                  debugPanelOpen ? "Close ACP Events" : "Open ACP Events"
                }
                icon={<Bug size={15} />}
                onClick={() => setDebugPanelOpen(!debugPanelOpen)}
                xstyle={[styles.windowButton, styles.debugButton]}
              />
            )}
            <WindowControls />
          </HStack>
        </HStack>
      }
    />
  );
}
