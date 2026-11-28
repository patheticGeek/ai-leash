import { VStack } from "@astryxdesign/core/Stack";
import * as stylex from "@stylexjs/stylex";
import { usePreference } from "@/data/preferences";
import { useAppStore } from "../../store";
import DebugEventsPanel from "./DebugEventsPanel";
import { useDebugEventCapture } from "./useDebugEventCapture";
import { useFloatingDebugPanel } from "./useFloatingDebugPanel";

const styles = stylex.create({
  // Above everything in the app's own stacking order; Astryx popovers and
  // menus open in the top layer, so they still paint over it.
  frame: {
    position: "fixed",
    zIndex: 999,
  },
  // The persisted position and size from `useFloatingDebugPanel`.
  place: (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
  }),
});

/**
 * The always-mounted (but usually invisible) devtools overlay: the ACP
 * Events panel, styled after React Query Devtools. Its toggle icon lives in
 * the centre's top band (`CentreBandEnd` in `TopBar.tsx`), not here — this
 * only renders the panel itself, gated on Settings > Debug's "Enable debug mode" and the
 * icon's open/closed state; event capture itself (`useDebugEventCapture`)
 * runs regardless of whether the panel is currently open, so toggling the
 * panel never drops anything already collected.
 *
 * Free-floating rather than docked to a screen edge — `useFloatingDebugPanel`
 * persists its own position and size, draggable by its header and resizable
 * from its corner, so it can sit anywhere over the rest of the app instead
 * of always covering the right-hand tool panel.
 */
export default function DebugDevtoolsOverlay() {
  useDebugEventCapture();

  const debugModeEnabled = usePreference("debugModeEnabled");
  const debugPanelOpen = useAppStore((s) => s.debugPanelOpen);
  const setDebugPanelOpen = useAppStore((s) => s.setDebugPanelOpen);

  const { x, y, width, height, onDragStart, onResizeStart } =
    useFloatingDebugPanel();

  if (!debugModeEnabled || !debugPanelOpen) return null;

  return (
    <VStack xstyle={[styles.frame, styles.place(x, y, width, height)]}>
      <DebugEventsPanel
        onClose={() => setDebugPanelOpen(false)}
        onDragStart={onDragStart}
        onResizeStart={onResizeStart}
      />
    </VStack>
  );
}
