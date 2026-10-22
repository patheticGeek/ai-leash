import { MessageSquare } from "lucide-react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { Button } from "@/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/ui/resizable";
import ChatPanel from "../chat/ChatPanel";
import BoardView from "./BoardView";

// What a project's board chat (`role: "project"`) shows in place of a plain
// chat: the board, with that chat docked on its right.
export default function ProjectBoardView({
  sessionId,
  projectRoot,
}: {
  sessionId: string;
  projectRoot: string;
}) {
  const chatPanel = usePanelRef();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "ai-leash:project-board",
    storage: localStorage,
  });

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel id="board" minSize="30">
        <BoardView
          projectRoot={projectRoot}
          toolbarEnd={
            <Button
              variant="ghost"
              size="sm"
              title="Show or hide the project chat"
              onClick={() => {
                const panel = chatPanel.current;
                if (!panel) return;
                if (panel.isCollapsed()) panel.expand();
                else panel.collapse();
              }}
            >
              <MessageSquare size={13} />
              Chat
            </Button>
          }
        />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        id="project-chat"
        panelRef={chatPanel}
        defaultSize="33"
        minSize={280}
        collapsible
        collapsedSize="0"
      >
        <div className="h-full min-w-0 border-l border-white/5">
          <ChatPanel sessionId={sessionId} projectRoot={projectRoot} compact />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
