import { usePreference } from "@/data/preferences";
import { useAppStore } from "../../store";
import DebugEventsPanel from "./DebugEventsPanel";
import { useDebugEventCapture } from "./useDebugEventCapture";
import { useFloatingDebugPanel } from "./useFloatingDebugPanel";

/**
 * The always-mounted (but usually invisible) devtools overlay: the ACP
 * Events panel, styled after React Query Devtools. Its toggle icon lives in
 * `TitleBar.tsx`, before the window controls, not here — this only renders
 * the panel itself, gated on Settings > Debug's "Enable debug mode" and the
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
    <div className="fixed z-[999]" style={{ left: x, top: y, width, height }}>
      <DebugEventsPanel
        onClose={() => setDebugPanelOpen(false)}
        onDragStart={onDragStart}
        onResizeStart={onResizeStart}
      />
    </div>
  );
}
