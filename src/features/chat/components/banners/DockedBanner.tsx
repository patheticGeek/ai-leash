import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import {
  colorVars,
  radiusVars,
  spacingVars,
  textSizeVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

type Status = "neutral" | "info" | "warning" | "error";

// What tucks a strip against `ChatInputBar`'s box: inset narrower than the
// box, square on the edge that meets it. No z-index on purpose — the box is
// positioned, so it paints over the strip and its outline ring stays whole
// where the two meet. Exported for `CheckoutBar` and `HelpBanner`, which dock
// the same way without being a `DockedBanner`.
export const dockStyles = stylex.create({
  dock: {
    marginInline: spacingVars["--spacing-10"],
  },
  top: {
    borderEndStartRadius: 0,
    borderEndEndRadius: 0,
  },
  bottom: {
    borderStartStartRadius: 0,
    borderStartEndRadius: 0,
  },
});

const styles = stylex.create({
  strip: {
    borderRadius: radiusVars["--radius-element"],
    paddingBlock: spacingVars["--spacing-2"],
    paddingInline: spacingVars["--spacing-3"],
    fontSize: textSizeVars["--font-size-sm"],
  },
  // The tone's muted fill blended into the page, so it reads as a quiet tint
  // like the rest of the chrome rather than a loud callout.
  neutral: {
    backgroundColor: colorVars["--color-background-card"],
    color: colorVars["--color-text-secondary"],
  },
  info: {
    backgroundColor: `color-mix(in srgb, ${colorVars["--color-info-muted"]} 45%, ${colorVars["--color-background-body"]})`,
    color: colorVars["--color-text-info"],
  },
  warning: {
    backgroundColor: `color-mix(in srgb, ${colorVars["--color-warning-muted"]} 45%, ${colorVars["--color-background-body"]})`,
    color: colorVars["--color-text-warning"],
  },
  error: {
    backgroundColor: `color-mix(in srgb, ${colorVars["--color-error-muted"]} 45%, ${colorVars["--color-background-body"]})`,
    color: colorVars["--color-text-error"],
  },
  title: {
    flexShrink: 0,
  },
  grow: {
    minWidth: 0,
    flexGrow: 1,
  },
});

export interface DockedBannerProps {
  status?: Status;
  /** Lead text, in the tone's colour. */
  title?: React.ReactNode;
  /** Dimmer text on the same line after the title. */
  description?: React.ReactNode;
  /** Actions at the end of the line. */
  endContent?: React.ReactNode;
  /** Extra rows under the line (e.g. one per queued message). */
  children?: React.ReactNode;
  /** Which edge meets the message box. */
  side?: "top" | "bottom";
  role?: React.AriaRole;
  "aria-label"?: string;
}

// A one-line strip docked against the message box: the rate-limit notice,
// queued messages and the task-link notice above it. Deliberately not an
// Astryx `Banner` — that's a full card with an icon header, too heavy for a
// line of status text tucked against the composer.
export default function DockedBanner({
  status = "neutral",
  title,
  description,
  endContent,
  children,
  side = "top",
  role,
  "aria-label": ariaLabel,
}: DockedBannerProps) {
  const hasLine = title != null || description != null || endContent != null;
  return (
    <VStack
      gap={1}
      role={role ?? (status === "error" ? "alert" : "status")}
      aria-label={ariaLabel}
      xstyle={[
        styles.strip,
        styles[status],
        dockStyles.dock,
        side === "top" ? dockStyles.top : dockStyles.bottom,
      ]}
    >
      {hasLine && (
        <HStack align="center" justify="between" gap={3}>
          <HStack align="center" gap={2} xstyle={styles.grow}>
            {title != null && (
              <Text
                type="inherit"
                color="inherit"
                weight="medium"
                maxLines={1}
                xstyle={styles.title}
              >
                {title}
              </Text>
            )}
            {description != null && (
              <Text type="inherit" color="secondary" maxLines={1}>
                {description}
              </Text>
            )}
          </HStack>
          {endContent}
        </HStack>
      )}
      {children}
    </VStack>
  );
}
