import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useAppStore } from "../../store";

interface AcpDebugEventPayload {
  sessionId: string;
  direction: "received" | "sent";
  event: string;
  payload: unknown;
}

/**
 * Subscribes to Rust's app-wide `acp://debug` channel (every conversation's
 * ACP connection, not just the active one) and appends each event into
 * `debugEvents` — but only while Settings > Debug's "Enable debug mode" is
 * on. Lives at the top level (`App.tsx`), not inside the devtools panel
 * itself, so events keep accumulating whether or not the panel is open;
 * closing the panel only hides the view, it never tears down capture.
 */
export function useDebugEventCapture() {
  const debugModeEnabled = useAppStore((s) => s.debugModeEnabled);
  const addDebugEvent = useAppStore((s) => s.addDebugEvent);

  useEffect(() => {
    if (!debugModeEnabled) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<AcpDebugEventPayload>("acp://debug", ({ payload }) => {
      if (disposed) return;
      addDebugEvent(payload);
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [debugModeEnabled, addDebugEvent]);
}
