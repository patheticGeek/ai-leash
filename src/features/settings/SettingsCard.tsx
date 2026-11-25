// The settings-dialog template's row idiom, shared by every panel: a muted
// `SettingsCard` (padding 0, subtle dividers) holding `SettingsRow`s — icon,
// title, description, a control in a fixed column, and an optional full-width
// detail under it. Copied from the template; the row stacks once the panel is
// 480px wide or less (`settingsPanel` is the container).
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon, type IconType } from "@astryxdesign/core/Icon";
import { HStack, Stack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Children, type ReactNode } from "react";

/** Width of a row's control column (selectors, text inputs). */
export const CONTROL_WIDTH = 192;

const ROW_STACK = "@container settings-panel (max-width: 480px)";

export const settingsPanel = stylex.create({
  root: { containerType: "inline-size", containerName: "settings-panel" },
});

const row = stylex.create({
  line: {
    display: "flex",
    flexDirection: { default: "row", [ROW_STACK]: "column" },
    alignItems: { default: "center", [ROW_STACK]: "stretch" },
    gap: {
      default: spacingVars["--spacing-3"],
      [ROW_STACK]: spacingVars["--spacing-2"],
    },
  },
  textColumn: { maxWidth: { default: 420, [ROW_STACK]: "none" } },
  control: { flexShrink: 0 },
});

export function SettingsCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const rows = Children.toArray(children);
  return (
    <VStack gap={1.5}>
      {title != null && (
        <Text type="supporting" weight="semibold" color="secondary">
          {title}
        </Text>
      )}
      <Card padding={0} width="100%" variant="muted">
        <VStack as="ul" role="list" gap={0}>
          {rows.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are static per render
            <VStack key={i} as="li" gap={0}>
              {i > 0 && <Divider variant="subtle" />}
              {r}
            </VStack>
          ))}
        </VStack>
      </Card>
    </VStack>
  );
}

export function SettingsRow({
  title,
  titleAccessory,
  description,
  icon,
  control,
  detail,
}: {
  title: string;
  titleAccessory?: ReactNode;
  description?: ReactNode;
  icon: IconType;
  control?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <VStack padding={4} gap={2}>
      <Stack xstyle={row.line}>
        <StackItem size="fill">
          <HStack gap={2} align="start">
            <VStack paddingBlockStart={0.5}>
              <Icon icon={icon} size="sm" color="secondary" />
            </VStack>
            <VStack gap={0.5} xstyle={row.textColumn}>
              {titleAccessory == null ? (
                <Text type="label">{title}</Text>
              ) : (
                <HStack gap={1.5} align="center">
                  <Text type="label">{title}</Text>
                  {titleAccessory}
                </HStack>
              )}
              {description != null && (
                <Text type="supporting" color="secondary">
                  {description}
                </Text>
              )}
            </VStack>
          </HStack>
        </StackItem>
        {control != null && <VStack xstyle={row.control}>{control}</VStack>}
      </Stack>
      {detail}
    </VStack>
  );
}
