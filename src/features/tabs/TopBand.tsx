import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { StackItem } from "@astryxdesign/core/Stack";
import { spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import { VStack } from "@astryxdesign/core/VStack";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

const styles = stylex.create({
  band: { flexShrink: 0 },
  // The top bar's height (the Toolbar's `md`, see `TOP_BAR_HEIGHT`), so
  // the centre's band and the side panel's band line up as one.
  row: { height: spacingVars["--spacing-11"] },
  // Takes what the end controls leave, and lets a tab strip in it scroll.
  start: { minWidth: 0 },
  end: { flexShrink: 0 },
});

// The window's top band, one per pane: the centre's (its tabs, then the
// Actions button, Open in external editor and the panel toggle) and the side panel's (its tabs, then +
// and the window controls), the same height with one divider under each, so
// side by side they read as a single bar. There is no title bar above
// them — the app has no native one — so a press on the band's empty
// space drags the window (`deep`: Tauri's drag script skips its buttons,
// tabs and other controls). Not an Astryx Toolbar: a Toolbar lane is never
// narrower than its controls, so a long tab strip would wrap the end
// controls onto a second line instead of scrolling.
export default function TopBand({
  start,
  end,
}: {
  start: ReactNode;
  end?: ReactNode;
}) {
  return (
    <VStack gap={0} xstyle={styles.band}>
      <HStack
        align="center"
        gap={1}
        paddingInline={2}
        xstyle={styles.row}
        data-tauri-drag-region="deep"
      >
        <StackItem size="fill" xstyle={styles.start}>
          <HStack align="center" gap={1} xstyle={styles.start}>
            {start}
          </HStack>
        </StackItem>
        {end && (
          <HStack align="center" gap={1} xstyle={styles.end}>
            {end}
          </HStack>
        )}
      </HStack>
      <Divider />
    </VStack>
  );
}
