// The app frame: the shell-side-nav template's AppShell (contentPadding 0,
// one resizable SideNav) wrapping a Layout whose pinned header is the title
// bar. Every screen renders inside this, so the rail, the title bar and the
// surface under them are identical everywhere.
import { useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import LeftBar, { type LeftBarSelection } from "./LeftBar";
import { SidebarCollapseContext } from "./sidebarCollapse";

export default function AppFrame({
  selection,
  titleBar,
  children,
  isSidebarCollapsed = false,
}: {
  selection: LeftBarSelection;
  titleBar: ReactNode;
  children: ReactNode;
  /** Initial collapse state (the screenshots show both). */
  isSidebarCollapsed?: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(isSidebarCollapsed);
  const collapse = useMemo(
    () => ({ isCollapsed, onCollapsedChange: setIsCollapsed, hasButton: false as const }),
    [isCollapsed],
  );
  return (
    <SidebarCollapseContext.Provider value={collapse}>
    <AppShell contentPadding={0} sideNav={<LeftBar selection={selection} />}>
      <Layout
        height="fill"
        header={titleBar}
        content={
          <LayoutContent padding={0} isScrollable={false}>
            {children}
          </LayoutContent>
        }
      />
    </AppShell>
    </SidebarCollapseContext.Provider>
  );
}
