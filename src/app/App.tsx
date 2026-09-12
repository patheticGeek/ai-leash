import { useEffect } from "react";
import SettingsModal from "../features/settings/SettingsModal";
import SidePanel from "../features/sidebar/SidePanel";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { useAppStore } from "../store";
import ResizeHandle from "../ui/ResizeHandle";
import CenterPanel from "./CenterPanel";
import LeftBar from "./LeftBar";
import TitleBar, { TITLEBAR_HEIGHT } from "./TitleBar";

function App() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const refreshOllamaModels = useAppStore((s) => s.refreshOllamaModels);
  const refreshProviderConnectivity = useAppStore(
    (s) => s.refreshProviderConnectivity,
  );
  const restoreLastProject = useAppStore((s) => s.restoreLastProject);
  const loadSubAgentTasks = useAppStore((s) => s.loadSubAgentTasks);
  const refreshAcpModelCache = useAppStore((s) => s.refreshAcpModelCache);

  const [leftBarWidth, leftBarResize] = useResizableWidth(
    "ai-leash:leftBarWidth",
    220,
    160,
    400,
    1,
  );
  const [rightPanelWidth, rightPanelResize] = useResizableWidth(
    "ai-leash:rightPanelWidth",
    360,
    240,
    720,
    -1,
  );

  useEffect(() => {
    refreshOllamaModels();
  }, [refreshOllamaModels]);

  useEffect(() => {
    refreshProviderConnectivity();
    const interval = setInterval(refreshProviderConnectivity, 5000);
    return () => clearInterval(interval);
  }, [refreshProviderConnectivity]);

  useEffect(() => {
    restoreLastProject();
  }, [restoreLastProject]);

  useEffect(() => {
    loadSubAgentTasks();
  }, [loadSubAgentTasks]);

  // One-shot per launch, not polled — each fetch briefly spawns and kills a
  // real subprocess per uncached ACP agent (see fetch_acp_models/acp.rs),
  // so this is a "figure it out once at startup" cache, not a live check.
  useEffect(() => {
    refreshAcpModelCache();
  }, [refreshAcpModelCache]);

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
    <div className="relative flex h-screen w-screen flex-col text-zinc-200">
      <TitleBar leftBarWidth={leftBarWidth} rightPanelWidth={rightPanelWidth} />
      <SettingsModal />
      <div
        className="flex flex-1 min-h-0"
        style={{ marginTop: TITLEBAR_HEIGHT }}
      >
        <div style={{ width: leftBarWidth }} className="shrink-0">
          <LeftBar />
        </div>
        <ResizeHandle width={leftBarWidth} {...leftBarResize} />
        <div className="flex-1 min-w-0">
          <CenterPanel key={projectRoot ?? "none"} />
        </div>
        <ResizeHandle width={rightPanelWidth} {...rightPanelResize} />
        <div style={{ width: rightPanelWidth }} className="shrink-0">
          <SidePanel />
        </div>
      </div>
    </div>
  );
}

export default App;
