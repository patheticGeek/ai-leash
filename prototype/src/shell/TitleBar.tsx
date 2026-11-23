// The window's title bar. It is the main region's pinned header (layout docs:
// "Toolbar instead of LayoutHeader when the header carries interactive
// controls"), not a TopNav: the side nav stays full height as in the
// shell-side-nav template, and this bar only spans the region it titles.
// Start content copies the ai-chat template's artifact toolbar (icon + label
// title + supporting subtitle); the divider between control groups copies the
// kanban-board toolbar's.
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import {
  ChevronDownIcon,
  CodeBracketIcon,
  MinusIcon,
  PlayIcon,
  StopIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

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

export default function TitleBar({
  icon,
  title,
  subtitle,
  controls,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  /** Screen-specific controls, before the window controls. */
  controls?: ReactNode;
}) {
  return (
    <Toolbar
      label="Title bar"
      dividers={["bottom"]}
      startContent={
        <HStack gap={3} vAlign="center">
          {icon}
          <VStack gap={0}>
            <Text type="label" weight="semibold" maxLines={1}>
              {title}
            </Text>
            <Text type="supporting" color="secondary" maxLines={1}>
              {subtitle}
            </Text>
          </VStack>
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
