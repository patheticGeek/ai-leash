import { Banner } from "@astryxdesign/core/Banner";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

// What tucks a strip against `ChatInputBar`'s box: inset narrower than the
// box and stacked above its edge. Exported for `CheckoutBar`, which
// docks the same way (below the box) without being a `Banner`.
export const dockStyles = stylex.create({
  dock: {
    marginInline: spacingVars["--spacing-10"],
    position: "relative",
    zIndex: 10,
  },
});

// A `Banner` docked above the message box (rate-limit notice, queued
// messages, task-link notice). `section` container: square corners, so its
// edge meets the box flush.
export default function DockedBanner(
  props: Omit<
    React.ComponentProps<typeof Banner>,
    "container" | "collapsible" | "xstyle"
  >,
) {
  return (
    <Banner
      {...props}
      container="section"
      collapsible={false}
      xstyle={dockStyles.dock}
    />
  );
}
