import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import EditorArea from "./components/EditorArea";
import TerminalPanel from "./components/TerminalPanel";
import ChatPanel from "./components/ChatPanel";
import StatusBar from "./components/StatusBar";
import PermissionModal from "./components/PermissionModal";
import { useAppStore } from "./store";

function App() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const refreshOllama = useAppStore((s) => s.refreshOllama);
  const restoreLastProject = useAppStore((s) => s.restoreLastProject);

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
        <div className="w-56 shrink-0">
          <Sidebar />
        </div>
        <div className="flex flex-1 min-w-0 flex-col">
          <div className="flex-[3] min-h-0">
            <EditorArea />
          </div>
          <div className="flex-[2] min-h-0">
            <TerminalPanel />
          </div>
        </div>
        <div className="w-96 shrink-0">
          <ChatPanel key={projectRoot ?? "none"} />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
