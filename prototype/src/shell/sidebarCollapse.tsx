// One controlled collapse config shared by the SideNav and the title bar
// (SideNavCollapseButton docs: "place it outside SideNav and hand the same
// controlled collapsible config to both"). Expanded, the toggle sits at the top
// of the rail beside the logo (SideNavHeading headerEndContent); collapsed, the
// heading's end slot is hidden, so the same toggle moves to the start of the
// title bar, right where the rail ends.
import { createContext, useContext } from "react";

export interface SidebarCollapse {
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  hasButton: false;
}

export const SidebarCollapseContext = createContext<SidebarCollapse>({
  isCollapsed: false,
  onCollapsedChange: () => {},
  hasButton: false,
});

export const useSidebarCollapse = () => useContext(SidebarCollapseContext);
