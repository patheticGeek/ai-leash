import { useEffect } from "react";
import LeftBar from "./components/LeftBar";
import SidePanel from "./components/SidePanel";
import ResizeHandle from "./components/ResizeHandle";
import CenterPanel from "./components/CenterPanel";
import StatusBar from "./components/StatusBar";
import SettingsModal from "./components/SettingsModal";
import { useAppStore } from "./store";
import { useResizableWidth } from "./hooks/useResizableWidth";

function App() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const refreshOllama = useAppStore((s) => s.refreshOllama);
  const refreshProviderConnectivity = useAppStore((s) => s.refreshProviderConnectivity);
  const restoreLastProject = useAppStore((s) => s.restoreLastProject);
  const loadSubAgentTasks = useAppStore((s) => s.loadSubAgentTasks);
  const refreshAcpModelCache = useAppStore((s) => s.refreshAcpModelCache);

  const [leftBarWidth, onLeftBarResize] = useResizableWidth(
    "ai-leash:leftBarWidth",
    220,
    160,
    400,
    1,
  );
  const [rightPanelWidth, onRightPanelResize] = useResizableWidth(
    "ai-leash:rightPanelWidth",
    360,
    240,
    720,
    -1,
  );

  useEffect(() => {
    refreshOllama();
  }, [refreshOllama]);

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

  return (
    <div className="flex h-screen w-screen flex-col text-zinc-200">
      <SettingsModal />
      <div className="flex flex-1 min-h-0">
        <div style={{ width: leftBarWidth }} className="shrink-0">
          <LeftBar />
        </div>
        <ResizeHandle onMouseDown={onLeftBarResize} />
        <div className="flex-1 min-w-0">
          <CenterPanel key={projectRoot ?? "none"} />
        </div>
        <ResizeHandle onMouseDown={onRightPanelResize} />
        <div style={{ width: rightPanelWidth }} className="shrink-0">
          <SidePanel />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
