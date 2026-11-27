import type { ResizableRegion } from "@astryxdesign/core/Resizable";
import { useMemo } from "react";

// One controlled collapse config shared by the sidebar and the centre's top
// band (`SideNavCollapseButton`'s docs: a button outside the SideNav gets the
// same controlled config). The sidebar's resizable region owns the state, so
// it is saved with the width. Expanded, the toggle sits at the top of the
// rail beside the logo; collapsed, the rail is an icon strip and the toggle
// leads the centre's top band instead (`CentreBandStart`). `hasButton: false`
// turns off the SideNav's own toggle in its footer.
export interface SidebarCollapse {
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  hasButton: false;
}

export function useSidebarCollapse(region: ResizableRegion): SidebarCollapse {
  const { isCollapsed, collapse, expand } = region;
  return useMemo(
    () => ({
      isCollapsed,
      onCollapsedChange: (next: boolean) => (next ? collapse() : expand()),
      hasButton: false as const,
    }),
    [isCollapsed, collapse, expand],
  );
}
