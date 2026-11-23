import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { borderVars, colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { TopNav } from "@astryxdesign/core/TopNav";
import * as stylex from "@stylexjs/stylex";
import {
  ChevronDown,
  Code2,
  Minus,
  Play,
  Square,
  X,
} from "lucide-react";
import Logo from "./Logo";

const styles = stylex.create({
  nav: {
    borderBlockEndWidth: borderVars["--border-width"],
    borderBlockEndStyle: "solid",
    borderBlockEndColor: colorVars["--color-border"],
  },
  // Same width as the sidebar under it, so the breadcrumb starts where the
  // chat column does.
  brand: { width: 236, flexShrink: 0, paddingInlineStart: spacingVars["--spacing-1"] },
  window: { marginInlineStart: spacingVars["--spacing-2"] },
});

export type BoardLayout = "board" | "both" | "chat";

export default function TitleBar({
  project,
  title,
  boardLayout,
}: {
  project: string;
  title?: string;
  /** Set on a project board: shows the layout switch instead of Open/Actions. */
  boardLayout?: BoardLayout;
}) {
  return (
    <TopNav
      label="Title bar"
      xstyle={styles.nav}
      heading={
        <HStack align="center" xstyle={styles.brand}>
          <Logo />
        </HStack>
      }
      startContent={
        <Text color="secondary" maxLines={1}>
          {project}
          {title && <Text color="disabled"> / {title}</Text>}
        </Text>
      }
      endContent={
        <HStack align="center" gap={1.5}>
          {boardLayout ? (
            <SegmentedControl
              label="Board layout"
              value={boardLayout}
              onChange={() => {}}
              size="sm"
            >
              <SegmentedControlItem label="Board" value="board" />
              <SegmentedControlItem label="Both" value="both" />
              <SegmentedControlItem label="Chat" value="chat" />
            </SegmentedControl>
          ) : (
            <>
              <IconButton
                variant="ghost"
                size="sm"
                label="Open in IDE"
                tooltip="Open in IDE"
                icon={<Icon icon={Code2} size="sm" />}
              />
              <ButtonGroup label="Actions" size="sm">
                <Button
                  variant="secondary"
                  size="sm"
                  label="dev"
                  icon={<Icon icon={Play} size="sm" />}
                />
                <IconButton
                  variant="secondary"
                  size="sm"
                  label="Other actions"
                  icon={<Icon icon={ChevronDown} size="sm" />}
                />
              </ButtonGroup>
            </>
          )}
          <HStack align="center" xstyle={styles.window}>
            <IconButton variant="ghost" size="sm" label="Minimize" icon={<Icon icon={Minus} size="sm" />} />
            <IconButton variant="ghost" size="sm" label="Maximize" icon={<Icon icon={Square} size="xsm" />} />
            <IconButton variant="ghost" size="sm" label="Close" icon={<Icon icon={X} size="sm" />} />
          </HStack>
        </HStack>
      }
    />
  );
}
