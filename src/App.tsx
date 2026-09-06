import { useEffect } from "react";
import LeftBar from "./components/LeftBar";
import SidePanel from "./components/SidePanel";
import ResizeHandle from "./components/ResizeHandle";
import ChatPanel from "./components/ChatPanel";
import StatusBar from "./components/StatusBar";
import PermissionModal from "./components/PermissionModal";
import { useAppStore } from "./store";
import { useResizableWidth } from "./hooks/useResizableWidth";

function App() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const refreshOllama = useAppStore((s) => s.refreshOllama);
  const restoreLastProject = useAppStore((s) => s.restoreLastProject);

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
    restoreLastProject();
  }, [restoreLastProject]);

  return (
    <div className="flex h-screen w-screen flex-col text-zinc-200">
      <PermissionModal />
      <div className="flex flex-1 min-h-0">
        <div style={{ width: leftBarWidth }} className="shrink-0">
          <LeftBar />
        </div>
        <ResizeHandle onMouseDown={onLeftBarResize} />
        <div className="flex-1 min-w-0">
          <ChatPanel key={projectRoot ?? "none"} />
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
