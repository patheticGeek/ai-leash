import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import {
  colorVars,
  radiusVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

// The building blocks every settings page shares, so the pages read the same:
// a quiet uppercase heading over each group, groups made of tinted rounded
// rows, and one dim hint style under a setting.

const styles = stylex.create({
  heading: {
    textTransform: "uppercase",
    letterSpacing: "0.025em",
  },
  // One setting: a tinted, rounded block on the dialog surface.
  row: {
    backgroundColor: colorVars["--color-background-muted"],
    borderRadius: radiusVars["--radius-element"],
    paddingBlock: spacingVars["--spacing-3"],
    paddingInline: spacingVars["--spacing-4"],
  },
});

/** The small uppercase title over a group of settings. */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Text
      as="h3"
      display="block"
      size="base"
      weight="medium"
      color="secondary"
      xstyle={styles.heading}
    >
      {children}
    </Text>
  );
}

/**
 * A titled group of settings rows. `actions` sit on the heading's line, at the
 * end (e.g. a Cancel or Refresh button).
 */
export function SettingsSection({
  title,
  actions,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <VStack as="section" gap={4}>
      {actions ? (
        <HStack justify="between" vAlign="center" gap={2}>
          <SectionHeading>{title}</SectionHeading>
          {actions}
        </HStack>
      ) : (
        <SectionHeading>{title}</SectionHeading>
      )}
      {children}
    </VStack>
  );
}

/** One tinted settings row; stacks its children with a small gap. */
export function SettingsRow({ children }: { children: ReactNode }) {
  return (
    <VStack gap={2} xstyle={styles.row}>
      {children}
    </VStack>
  );
}

/** Dim explanatory text under a setting, or a small caption over a field. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <Text display="block" size="sm" color="secondary">
      {children}
    </Text>
  );
}
