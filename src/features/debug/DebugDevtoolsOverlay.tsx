import { TITLEBAR_HEIGHT } from "../../app/TitleBar";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { LS_KEYS } from "../../lib/localStorageKeys";
import { useAppStore } from "../../store";
import ResizeHandle from "../../ui/ResizeHandle";
import DebugEventsPanel from "./DebugEventsPanel";
import { useDebugEventCapture } from "./useDebugEventCapture";

/**
 * The always-mounted (but usually invisible) devtools overlay: the ACP
 * Events panel, styled after React Query Devtools. Its toggle icon lives in
 * `TitleBar.tsx`, before the window controls, not here — this only renders
 * the panel itself, gated on Settings > Debug's "Enable debug mode" and the
 * icon's open/closed state; event capture itself (`useDebugEventCapture`)
 * runs regardless of whether the panel is currently open, so toggling the
 * panel never drops anything already collected.
 *
 * The panel is absolutely positioned over the right-hand tool panel rather
 * than pushing the layout around, with its own independently adjustable
 * width — see the `ask`: "show the panel over the right sidebar for now
 * (absolutely position above it, with independent width adjustment)".
 */
export default function DebugDevtoolsOverlay() {
  useDebugEventCapture();

  const debugModeEnabled = useAppStore((s) => s.debugModeEnabled);
  const debugPanelOpen = useAppStore((s) => s.debugPanelOpen);
  const setDebugPanelOpen = useAppStore((s) => s.setDebugPanelOpen);

  const [panelWidth, panelResize] = useResizableWidth(
    LS_KEYS.debugPanelWidth,
    420,
    280,
    900,
    -1,
  );

  if (!debugModeEnabled || !debugPanelOpen) return null;

  return (
    <div
      className="fixed right-0 z-[999] flex"
      style={{ top: TITLEBAR_HEIGHT, bottom: 0 }}
    >
      <ResizeHandle width={panelWidth} {...panelResize} />
      <DebugEventsPanel
        width={panelWidth}
        onClose={() => setDebugPanelOpen(false)}
      />
    </div>
  );
}
