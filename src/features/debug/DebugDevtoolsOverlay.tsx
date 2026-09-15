import { Bug } from "lucide-react";
import { TITLEBAR_HEIGHT } from "../../app/TitleBar";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { LS_KEYS } from "../../lib/localStorageKeys";
import { useAppStore } from "../../store";
import ResizeHandle from "../../ui/ResizeHandle";
import DebugEventsPanel from "./DebugEventsPanel";
import { useDebugEventCapture } from "./useDebugEventCapture";

/**
 * The always-mounted (but usually invisible) devtools overlay: a floating
 * toggle icon plus the ACP Events panel it opens, styled after
 * React Query Devtools. Only rendered — icon included — while Settings >
 * Debug's "Enable debug mode" is on; event capture itself (`useDebugEventCapture`)
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

  if (!debugModeEnabled) return null;

  return (
    <>
      <button
        type="button"
        title={debugPanelOpen ? "Close ACP Events" : "Open ACP Events"}
        onClick={() => setDebugPanelOpen(!debugPanelOpen)}
        className="fixed bottom-4 right-4 z-[1000] flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg transition-transform hover:scale-105"
      >
        <Bug size={16} />
      </button>
      {debugPanelOpen && (
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
      )}
    </>
  );
}
