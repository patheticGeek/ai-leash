import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { ResizeHandle } from "@astryxdesign/core/Resizable";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { LS_KEYS } from "../../lib/localStorageKeys";
import ChatPanel from "../chat/ChatPanel";
import BoardView from "./BoardView";
import { useBoardLayout } from "./boardLayout";

// What a project's board chat (`role: "project"`) shows in place of a plain
// chat: the board, its chat, or both (`BoardLayoutSwitch` in the title bar).
// In Both the chat docks in the ide template's end panel behind a
// ResizeHandle, and the board keeps its column widths and scrolls sideways
// in what's left. The chat never has a checkout bar: it always works in the
// project's main checkout. Its draft and running turn live outside the
// component (`chatDraft.ts`, the backend), so switching layouts — which
// remounts it — loses nothing.
export default function ProjectBoardView({
  sessionId,
  projectRoot,
}: {
  sessionId: string;
  projectRoot: string;
}) {
  const layout = useBoardLayout();
  const chatPanel = useResizableWidth(LS_KEYS.projectChatWidth, 380, 300, 560);

  if (layout === "chat") {
    // On its own, a normal centered chat.
    return (
      <ChatPanel
        sessionId={sessionId}
        projectRoot={projectRoot}
        showCheckout={false}
      />
    );
  }

  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0} isScrollable={false}>
          <BoardView projectRoot={projectRoot} />
        </LayoutContent>
      }
      end={
        layout === "both" && (
          <>
            <ResizeHandle
              isReversed
              resizable={chatPanel}
              label="Resize project chat"
            />
            <LayoutPanel
              resizable={chatPanel}
              isScrollable={false}
              padding={0}
              label="Project chat"
            >
              {/* A narrow column: fills it, with the compact composer. */}
              <ChatPanel
                sessionId={sessionId}
                projectRoot={projectRoot}
                compact
                showCheckout={false}
              />
            </LayoutPanel>
          </>
        )
      }
    />
  );
}
