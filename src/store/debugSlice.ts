import type { StateCreator } from "zustand";
import type { AppStore } from "./index";

export interface AcpDebugEvent {
  id: number;
  /** AI Leash's own conversation id — the ACP protocol's own session id
   * (assigned by the agent, distinct from this) shows up inside individual
   * events' payloads instead, see `latestAcpSessionId` in
   * `DebugEventsPanel.tsx`. */
  sessionId: string;
  direction: "received" | "sent";
  event: string;
  payload: unknown;
  receivedAt: number;
}

// Capped so leaving debug mode on for a long-running session doesn't grow
// this without bound — old events roll off the front once the cap is hit.
const MAX_DEBUG_EVENTS = 2000;

let nextDebugEventId = 0;

export interface DebugSlice {
  // Only the devtools icon vs. panel visibility — independent of whether
  // events are being captured, so closing the panel never drops anything
  // (per the ask: open/close shouldn't lose events, only turning debug
  // mode off entirely does — see `resetDebugState`, called by
  // `useDebugEventCapture` when the preference turns off).
  debugPanelOpen: boolean;
  debugEvents: AcpDebugEvent[];
  setDebugPanelOpen: (open: boolean) => void;
  addDebugEvent: (event: Omit<AcpDebugEvent, "id" | "receivedAt">) => void;
  clearDebugEvents: () => void;
  resetDebugState: () => void;
}

export const debugSlice: StateCreator<AppStore, [], [], DebugSlice> = (
  set,
) => ({
  debugPanelOpen: false,
  debugEvents: [],

  setDebugPanelOpen: (open) => set({ debugPanelOpen: open }),
  addDebugEvent: (event) => {
    set((s) => {
      const next = [
        ...s.debugEvents,
        { ...event, id: nextDebugEventId++, receivedAt: Date.now() },
      ];
      return {
        debugEvents:
          next.length > MAX_DEBUG_EVENTS
            ? next.slice(next.length - MAX_DEBUG_EVENTS)
            : next,
      };
    });
  },
  clearDebugEvents: () => set({ debugEvents: [] }),
  resetDebugState: () => set({ debugPanelOpen: false, debugEvents: [] }),
});
