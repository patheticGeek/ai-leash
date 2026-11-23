// The window's title bar. It is the main region's pinned header (layout docs:
// "Toolbar instead of LayoutHeader when the header carries interactive
// controls"), not a TopNav: the side nav stays full height as in the
// shell-side-nav template, and this bar only spans the region it titles.
// Start content is a one-line Breadcrumbs trail (project / page, the last item
// isCurrent); while the sidebar is collapsed the expand toggle leads it. The
// divider between control groups copies the kanban-board toolbar's.
import type { ReactNode } from "react";
import { useSidebarCollapse } from "./sidebarCollapse";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { BreadcrumbItem, Breadcrumbs } from "@astryxdesign/core/Breadcrumbs";
import { SideNavCollapseButton } from "@astryxdesign/core/SideNav";
import { HStack } from "@astryxdesign/core/Stack";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  ChevronDownIcon,
  CodeBracketIcon,
  MinusIcon,
  PlayIcon,
  StopIcon,
  XMarkIcon,
} from "../icons-lucide";

const styles = stylex.create({
  toolbarDivider: {
    height: "auto",
    marginBlock: spacingVars["--spacing-1"],
    alignSelf: "stretch",
  },
});

export function WindowControls() {
  return (
    <>
      <Divider variant="strong" orientation="vertical" xstyle={styles.toolbarDivider} />
      <IconButton variant="ghost" size="sm" label="Minimize" icon={<Icon icon={MinusIcon} size="sm" />} />
      <IconButton variant="ghost" size="sm" label="Maximize" icon={<Icon icon={StopIcon} size="sm" />} />
      <IconButton variant="ghost" size="sm" label="Close window" icon={<Icon icon={XMarkIcon} size="sm" />} />
    </>
  );
}

export function RunControls() {
  return (
    <>
      <IconButton
        variant="ghost"
        size="sm"
        label="Open in external editor"
        tooltip="Open in external editor"
        icon={<Icon icon={CodeBracketIcon} size="sm" />}
      />
      <ButtonGroup label="Actions" size="sm">
        <Button label="dev" size="sm" icon={<Icon icon={PlayIcon} size="sm" />} />
        <IconButton size="sm" label="Other actions" icon={<Icon icon={ChevronDownIcon} size="sm" />} />
      </ButtonGroup>
    </>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

export default function TitleBar({
  crumbs,
  controls,
}: {
  /** project / page; the last crumb is the current page. */
  crumbs: Crumb[];
  /** Screen-specific controls, before the window controls. */
  controls?: ReactNode;
}) {
  const collapse = useSidebarCollapse();
  return (
    <Toolbar
      label="Title bar"
      dividers={["bottom"]}
      startContent={
        <HStack gap={2} vAlign="center">
          {collapse.isCollapsed && <SideNavCollapseButton collapsible={collapse} size="sm" label="Expand sidebar" />}
          <Breadcrumbs label="Location">
            {crumbs.map((c, i) => (
              <BreadcrumbItem key={c.label} href={c.href} isCurrent={i === crumbs.length - 1}>
                {c.label}
              </BreadcrumbItem>
            ))}
          </Breadcrumbs>
        </HStack>
      }
      endContent={
        <>
          {controls}
          <WindowControls />
        </>
      }
    />
  );
}
