import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { Button } from "@/ui/button";
import { useIsBoardView } from "../features/board/useIsBoardView";
import { TabBody } from "../features/tabs/TabContent";
import { useTabDropArea } from "../features/tabs/TabDnd";
import TabStrip from "../features/tabs/TabStrip";
import { useAppStore } from "../store";
import { PRIMARY_TAB_ID } from "../store/panelSlice";

function NoProjectState() {
  const addProject = useAppStore((s) => s.addProject);

  async function pickProject() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      await addProject(dir);
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-raised text-primary-hover shadow-[0_0_0_1px_rgba(58,95,143,0.35),0_12px_30px_rgba(0,0,0,0.25)]">
          <FolderOpen size={28} strokeWidth={1.6} />
        </div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-primary-hover/80">
          Welcome to ai-leash
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Start with a project
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Open a local folder to give your agent context, tools, and a
          conversation that stays with the project.
        </p>
        <Button
          onClick={pickProject}
          className="mt-7 gap-2 bg-primary text-primary-foreground shadow-[0_2px_10px_rgba(58,95,143,0.3)] hover:bg-primary-hover"
        >
          <FolderOpen size={15} />
          Open a project folder
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          You can also use the <span className="text-muted-foreground">+</span>{" "}
          button in the sidebar header.
        </p>
      </div>
    </div>
  );
}

export default function CenterPanel() {
  const projectRoot = useAppStore((s) => s.projectRoot);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const hasDraft = useAppStore((s) => s.draft !== null);
  const chatTabs = useAppStore((s) => s.chatTabs);
  const activeChatTabId = useAppStore((s) => s.activeChatTabId);
  const activateTab = useAppStore((s) => s.activateTab);
  const dropRef = useTabDropArea("center");
  // The board is one view, not a set of tabs: only its primary tab shows.
  const boardView = useIsBoardView();

  if (!projectRoot || (!activeSessionId && !hasDraft)) {
    return (
      <div className="flex h-full flex-col bg-background">
        <NoProjectState />
      </div>
    );
  }

  return (
    <div ref={dropRef} className="flex h-full flex-col">
      {!boardView && (
        <TabStrip
          tabs={chatTabs}
          value={activeChatTabId}
          onSelect={activateTab}
          className="shrink-0 bg-background"
        />
      )}
      <div className="relative flex-1 min-h-0 bg-background">
        <TabBody
          tabs={chatTabs}
          activeId={boardView ? PRIMARY_TAB_ID : activeChatTabId}
        />
      </div>
    </div>
  );
}
