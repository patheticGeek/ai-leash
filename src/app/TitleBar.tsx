import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { Copy, Minus, Square, SquarePen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { useAppStore } from "../store";
import Logo from "../ui/Logo";
import TitleBarActions from "./TitleBarActions";

export const TITLEBAR_HEIGHT = 36;

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
    <div className="flex h-full shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        className="h-full w-10 rounded-none"
        title="Minimize"
        onClick={() => tauriWindow()?.minimize()}
      >
        <Minus size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-full w-10 rounded-none"
        title={maximized ? "Restore" : "Maximize"}
        onClick={() => tauriWindow()?.toggleMaximize()}
      >
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-full w-10 rounded-none hover:bg-red-500 hover:text-white"
        title="Close"
        onClick={() => tauriWindow()?.close()}
      >
        <X size={14} />
      </Button>
    </div>
  );
}

export default function TitleBar({
  leftBarWidth,
  rightPanelWidth,
}: {
  leftBarWidth: number;
  rightPanelWidth: number;
}) {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const recentProjects = useAppStore((s) => s.recentProjects);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const conversations = useAppStore((s) => s.conversations);
  const chatTabs = useAppStore((s) => s.chatTabs);
  const activeChatTabId = useAppStore((s) => s.activeChatTabId);
  const startNewConversation = useAppStore((s) => s.startNewConversation);
  const addProject = useAppStore((s) => s.addProject);

  const project = recentProjects.find((p) => p.path === projectRoot);
  const activeConversation = conversations.find(
    (c) => c.id === activeSessionId,
  );
  // A conversation not yet in `conversations` has never had a message sent
  // — see `ChatPanel.tsx`'s identical `isNewThread` derivation.
  const isNewThread = !activeConversation;
  const activeChatTab = chatTabs.find((t) => t.id === activeChatTabId);
  const conversationTitle =
    activeChatTab?.kind === "subagent"
      ? activeChatTab.label
      : activeConversation?.title;

  // Starts a fresh thread directly in whatever project is currently open —
  // no project picker here (see `ChatPanel.tsx`'s "What are we working on
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
    <div
      data-tauri-drag-region
      className="absolute top-0 left-0 right-0 z-20 flex bg-[#0b0c0e]"
      style={{ height: TITLEBAR_HEIGHT }}
    >
      <div
        data-tauri-drag-region
        style={{ width: leftBarWidth }}
        className="flex shrink-0 items-center justify-between px-2.5 shadow-[var(--al-shadow-r)]"
      >
        <Logo className="h-3 w-auto shrink-0 ml-1.5" />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-lg"
            title="Start a new thread in the current project"
            onClick={onNewThread}
          >
            <SquarePen size={17} />
          </Button>
        </div>
      </div>
      {/* matches the 4px ResizeHandle between LeftBar and CenterPanel below */}
      <div className="w-1 shrink-0" />
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center px-3 text-xs text-zinc-400 bg-[#0e0f12]"
      >
        {project && (
          <span className="min-w-0 truncate">
            {project.name}
            {isNewThread ? (
              <span className="text-zinc-600"> / New Thread</span>
            ) : (
              conversationTitle && (
                <span className="text-zinc-600"> / {conversationTitle}</span>
              )
            )}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center pl-3">
          <TitleBarActions />
        </div>
      </div>
      {/* matches the 4px ResizeHandle between CenterPanel and SidePanel below */}
      <div className="w-1 shrink-0" />
      <div
        data-tauri-drag-region
        style={{ width: rightPanelWidth }}
        className="flex shrink-0 items-center justify-end shadow-[var(--al-shadow-l)]"
      >
        <WindowControls />
      </div>
    </div>
  );
}
