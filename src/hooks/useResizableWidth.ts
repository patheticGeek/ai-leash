import { type ResizableSize, useResizable } from "@astryxdesign/core/Resizable";
import type { RefObject } from "react";

/**
 * A drag/keyboard-resizable pane width, persisted across restarts — Astryx's
 * `useResizable`, whose region feeds a `SideNav`/`LayoutPanel`'s `resizable`
 * prop and a `ResizeHandle`.
 *
 * `storageKey` doubles as the `autoSaveId`. Astryx stores its entry under its
 * own prefix, so the width this app persisted before (a bare number under
 * `storageKey` itself) is read once as the starting size; from then on the
 * Astryx entry wins.
 *
 * Sizes are pixels, or percentages (`"25%"`) of `containerRef`'s element.
 */
export function useResizableWidth(
  storageKey: string,
  defaultWidth: ResizableSize,
  min: ResizableSize,
  max: ResizableSize,
  // Lets the region collapse (to the SideNav's icon rail, say); the
  // collapse state is saved with the width.
  collapsible = false,
  containerRef?: RefObject<HTMLElement | null>,
) {
  const legacy = Number(localStorage.getItem(storageKey));
  const isLegacyInRange =
    typeof min === "number" &&
    typeof max === "number" &&
    legacy >= min &&
    legacy <= max;
  return useResizable({
    defaultSize: isLegacyInRange ? legacy : defaultWidth,
    minSize: min,
    maxSize: max,
    autoSaveId: storageKey,
    collapsible,
    containerRef,
  });
}
