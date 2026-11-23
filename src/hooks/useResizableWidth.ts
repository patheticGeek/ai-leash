import { useResizable } from "@astryxdesign/core/Resizable";

/**
 * A drag/keyboard-resizable pane width, persisted across restarts — Astryx's
 * `useResizable`, whose region feeds a `SideNav`/`LayoutPanel`'s `resizable`
 * prop and a `ResizeHandle`.
 *
 * `storageKey` doubles as the `autoSaveId`. Astryx stores its entry under its
 * own prefix, so the width this app persisted before (a bare number under
 * `storageKey` itself) is read once as the starting size; from then on the
 * Astryx entry wins.
 */
export function useResizableWidth(
  storageKey: string,
  defaultWidth: number,
  min: number,
  max: number,
  // Lets the region collapse (to the SideNav's icon rail, say); the
  // collapse state is saved with the width.
  collapsible = false,
) {
  const legacy = Number(localStorage.getItem(storageKey));
  return useResizable({
    defaultSize: legacy >= min && legacy <= max ? legacy : defaultWidth,
    minSize: min,
    maxSize: max,
    autoSaveId: storageKey,
    collapsible,
  });
}
