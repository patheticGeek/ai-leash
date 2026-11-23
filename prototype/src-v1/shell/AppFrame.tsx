import { AppShell } from "@astryxdesign/core/AppShell";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import type { ReactNode } from "react";
import LeftBar from "./LeftBar";
import TitleBar, { type BoardLayout } from "./TitleBar";

/**
 * The app frame: TopNav title bar, the side-nav template's resizable
 * SideNav, the centre, and (outside a board) the ide template's inspector
 * pane on the right.
 */
export default function AppFrame({
  project,
  title,
  boardLayout,
  selectedChat,
  selectedBoard,
  end,
  endWidth = 380,
  children,
}: {
  project: string;
  title?: string;
  boardLayout?: BoardLayout;
  selectedChat?: string;
  selectedBoard?: string;
  end?: ReactNode;
  endWidth?: number;
  children: ReactNode;
}) {
  const panel = useResizable({ defaultSize: endWidth, minSize: 260, maxSize: 720 });
  return (
    <AppShell
      variant="wash"
      mobileNav={{ breakpoint: "none", hasToggle: false }}
      topNav={<TitleBar project={project} title={title} boardLayout={boardLayout} />}
      sideNav={<LeftBar selectedChat={selectedChat} selectedBoard={selectedBoard} />}
    >
      <Layout
        content={
          <LayoutContent isScrollable={false} padding={0}>
            {children}
          </LayoutContent>
        }
        end={
          end && (
            <>
              <ResizeHandle isReversed resizable={panel.props} label="Resize side panel" hasDivider />
              <LayoutPanel width={panel.size} isScrollable={false} padding={0} label="Side panel">
                {end}
              </LayoutPanel>
            </>
          )
        }
      />
    </AppShell>
  );
}
