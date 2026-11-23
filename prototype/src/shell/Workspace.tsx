// The ide template's split: the centre pane fills, the tool panel sits in the
// end slot behind a ResizeHandle (handle first, isReversed, it owns the
// divider so the panel has none). Budget: 380 (layout docs: 340–420).
import type { ReactNode } from "react";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";

export default function Workspace({ center, panel }: { center: ReactNode; panel?: ReactNode }) {
  const endPanel = useResizable({
    defaultSize: 380,
    minSize: 300,
    maxSize: 560,
    collapsible: true,
    collapsedSize: 50,
  });
  return (
    <Layout
      height="fill"
      content={
        <LayoutContent padding={0} isScrollable={false}>
          {center}
        </LayoutContent>
      }
      end={
        panel ? (
          <>
            <ResizeHandle
              direction="horizontal"
              hasDivider
              isReversed
              isAlwaysVisible={false}
              resizable={endPanel.props}
              label="Resize tool panel"
            />
            {!endPanel.isCollapsed && (
              <LayoutPanel width={endPanel.size} hasDivider={false} padding={0} isScrollable={false}>
                {panel}
              </LayoutPanel>
            )}
          </>
        ) : undefined
      }
    />
  );
}
