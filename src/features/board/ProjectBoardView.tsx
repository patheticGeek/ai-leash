import { useDefaultLayout } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/ui/resizable";
import ChatPanel from "../chat/ChatPanel";
import BoardView from "./BoardView";
import { useBoardLayout } from "./boardLayout";

// What a project's board chat (`role: "project"`) shows in place of a plain
// chat: the board, its chat, or both side by side (`BoardLayoutSwitch` in
// the title bar). Panels are keyed so the chat stays mounted — and keeps
// streaming — as the layout changes. The chat never has a checkout bar:
// it always works in the project's main checkout.
export default function ProjectBoardView({
  sessionId,
  projectRoot,
}: {
  sessionId: string;
  projectRoot: string;
}) {
  const layout = useBoardLayout();
  const showBoard = layout !== "chat";
  const showChat = layout !== "board";
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "ai-leash:project-board",
    storage: localStorage,
    panelIds: [
      ...(showBoard ? ["board"] : []),
      ...(showChat ? ["project-chat"] : []),
    ],
  });

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      {showBoard && (
        <ResizablePanel key="board" id="board" minSize="30">
          <BoardView projectRoot={projectRoot} />
        </ResizablePanel>
      )}
      {showBoard && showChat && <ResizableHandle key="handle" />}
      {showChat && (
        <ResizablePanel
          key="project-chat"
          id="project-chat"
          defaultSize={showBoard ? "33" : "100"}
          minSize={280}
        >
          <div
            className={cn(
              "h-full min-w-0",
              showBoard && "border-l border-white/5",
            )}
          >
            {/* Beside the board it's a narrow column; on its own, a
                normal centered chat. */}
            <ChatPanel
              sessionId={sessionId}
              projectRoot={projectRoot}
              compact={showBoard}
              showCheckout={false}
            />
          </div>
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}
