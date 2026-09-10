import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { Copy, Minus, PlusIcon, SettingsIcon, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "../store";
import Button from "./Button";
import Logo from "./Logo";
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
  const chatTabs = useAppStore((s) => s.chatTabs);
  const activeChatTabId = useAppStore((s) => s.activeChatTabId);
  const setSettingsModalOpen = useAppStore((s) => s.setSettingsModalOpen);
  const openProject = useAppStore((s) => s.openProject);

  const projectName = recentProjects.find((p) => p.path === projectRoot)?.name;
  const conversationTitle = chatTabs.find(
    (t) => t.id === activeChatTabId,
  )?.label;

  async function pickProject() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      await openProject(dir);
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
            size="icon"
            onClick={() => setSettingsModalOpen(true)}
            title="Provider settings"
          >
            <SettingsIcon size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={pickProject}
            title="Open project"
          >
            <PlusIcon size={14} />
          </Button>
        </div>
      </div>
      {/* matches the 4px ResizeHandle between LeftBar and CenterPanel below */}
      <div className="w-1 shrink-0" />
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center px-3 text-xs text-zinc-400 bg-[#0e0f12]"
      >
        {projectName && (
          <span className="min-w-0 truncate">
            {projectName}
            {conversationTitle && (
              <span className="text-zinc-600"> / {conversationTitle}</span>
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
